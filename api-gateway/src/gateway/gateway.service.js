// src/gateway/gateway.service.js
import fetch from "node-fetch";

/**
 * Construye el mapa de servicios a partir de las variables de entorno
 * Ejemplo en env: SERVICE_USERS=https://users-api.azurewebsites.net
 */
export function buildServiceMap(env = process.env) {
  const map = {};
  for (const k of Object.keys(env)) {
    if (k.startsWith("SERVICE_")) {
      const svc = k.slice("SERVICE_".length).toLowerCase();
      map[svc] = env[k];
    }
  }
  return map;
}

/**
 * Resuelve la URL objetivo para un servicio y un path interno.
 * - service: nombre short (e.g. 'users', 'doctors')
 * - restPath: ruta relativa (e.g. 'health' o 'users/123')
 * Retorna null si no existe el servicio.
 */
export function getTargetUrl(serviceMap, service, restPath = "") {
  const root = serviceMap[service?.toLowerCase()];
  if (!root) return null;
  const cleanedRoot = root.replace(/\/$/, "");         // remove trailing slash
  const cleanedPath = (restPath || "").replace(/^\//, ""); // remove leading slash
  return cleanedPath ? `${cleanedRoot}/${cleanedPath}` : cleanedRoot;
}

/**
 * Construye las opciones para fetch a partir del request original.
 * No envía headers peligrosos (host, content-length) y fija content-type si hay body.
 */
export function buildFetchOptions(req) {
  const headers = { ...req.headers };

  // node-fetch expects lower-case header names sometimes; ensure host is removed
  delete headers.host;
  delete headers["content-length"];

  // Si quieres filtrar/añadir headers, hazlo aquí.
  // Por ejemplo, reenviar solo Authorization y Content-Type:
  // const safeHeaders = {};
  // if (headers.authorization) safeHeaders.authorization = headers.authorization;
  // if (headers["content-type"]) safeHeaders["content-type"] = headers["content-type"];

  const opts = {
    method: req.method,
    headers,
    redirect: "manual",
  };

  // No body for GET/HEAD
  if (req.method !== "GET" && req.method !== "HEAD") {
    // En express con json body parser, req.body ya es objeto; stringify
    if (req.body !== undefined) {
      // Si viene un body que no es JSON, podrías adaptar según content-type
      opts.body = JSON.stringify(req.body);
      opts.headers = { ...opts.headers, "content-type": "application/json" };
    }
  }

  return opts;
}

/**
 * Realiza el forward con node-fetch y devuelve un objeto con status, headers y body (en texto).
 * No intenta stream ni pipe (para simplicidad). Para archivos grandes usar streams.
 */
export async function forwardRequestToTarget(targetUrl, fetchOpts, timeoutMs = 15000) {
  // timeout manual si deseas (node-fetch v3 no trae timeout por defecto)
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(targetUrl, { ...fetchOpts, signal: controller.signal });
    clearTimeout(id);
    const text = await r.text();
    // Copiar headers a un objeto plano
    const respHeaders = {};
    r.headers.forEach((v, k) => {
      respHeaders[k] = v;
    });
    // Intentar parsear JSON para devolver objeto si aplica
    let body = text;
    try {
      body = JSON.parse(text);
    } catch (e) {
      // body queda como texto
    }
    return { status: r.status, headers: respHeaders, body };
  } catch (err) {
    clearTimeout(id);
    // identifica abort error
    if (err.name === "AbortError") {
      throw new Error("Timeout contacting backend service");
    }
    throw err;
  }
}

/**
 * Envia la respuesta "proxy" al cliente replicando código y headers básicos.
 * Evita reenviar headers no permitidos.
 */
export function sendForwardedResponse(res, forwarded) {
  // Copiar headers (con cuidado)
  if (forwarded.headers) {
    for (const [k, v] of Object.entries(forwarded.headers)) {
      // evitar headers que Node/Express controla
      if (["transfer-encoding", "content-length", "connection"].includes(k.toLowerCase())) continue;
      try {
        res.setHeader(k, v);
      } catch (e) {
        // ignore header setting errors
      }
    }
  }

  // Si body es objeto lo envía como JSON, si no lo envía como texto
  if (typeof forwarded.body === "object") {
    res.status(forwarded.status).json(forwarded.body);
  } else {
    res.status(forwarded.status).send(forwarded.body);
  }
}
