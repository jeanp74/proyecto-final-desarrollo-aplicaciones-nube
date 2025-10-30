/* =========================================================
   DOCTORES (esquema + tabla + privilegios)
   - Guarda médicos y su especialidad.
   - Llave única en correo para evitar duplicados.
   ========================================================= */
CREATE SCHEMA IF NOT EXISTS doctors_schema AUTHORIZATION jpshadmin;

CREATE TABLE IF NOT EXISTS doctors_schema.medicos (
  id              SERIAL PRIMARY KEY,      -- Identificador único autoincremental
  nombre_completo TEXT  NOT NULL,          -- Nombre y apellidos del médico
  especialidad    TEXT  NOT NULL,          -- Ej: Cardiología, Pediatría, etc.
  correo          TEXT UNIQUE,             -- ÚNICO: evita dos médicos con el mismo correo
  telefono        TEXT,                    -- Teléfono de contacto
  activo          BOOLEAN DEFAULT TRUE     -- Estado activo/inactivo
);

-- Privilegios para el administrador (esquema, tablas y secuencias del esquema)
GRANT ALL PRIVILEGES ON SCHEMA doctors_schema TO jpshadmin;
GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA doctors_schema TO jpshadmin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA doctors_schema TO jpshadmin;


/* =========================================================
   PACIENTES (esquema + tabla + privilegios)
   - Guarda info básica del paciente.
   - Llaves únicas en documento y correo para evitar duplicados.
   ========================================================= */
CREATE SCHEMA IF NOT EXISTS patients_schema AUTHORIZATION jpshadmin;

CREATE TABLE IF NOT EXISTS patients_schema.pacientes (
  id               SERIAL PRIMARY KEY,     -- Identificador único autoincremental
  nombres          TEXT  NOT NULL,         -- Nombres del paciente
  apellidos        TEXT  NOT NULL,         -- Apellidos del paciente
  documento        TEXT UNIQUE,            -- ÚNICO: CC/DNI/Pasaporte; evita duplicados
  correo           TEXT UNIQUE,            -- ÚNICO: correo del paciente
  telefono         TEXT,                   -- Teléfono de contacto
  fecha_nacimiento DATE,                   -- Fecha de nacimiento
  genero           TEXT                    -- Ej: 'masculino','femenino','otro'
);

GRANT ALL PRIVILEGES ON SCHEMA patients_schema TO jpshadmin;
GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA patients_schema TO jpshadmin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA patients_schema TO jpshadmin;


/* =========================================================
   CITAS (esquema + tabla + privilegios)
   - Registra una cita entre un paciente y un médico.
   - Llaves foráneas:
       paciente_id → patients_schema.pacientes(id)
       medico_id   → doctors_schema.medicos(id)
   - (Opcional) Puedes agregar después una restricción para evitar traslapes.
   ========================================================= */
CREATE SCHEMA IF NOT EXISTS appointments_schema AUTHORIZATION jpshadmin;

CREATE TABLE IF NOT EXISTS appointments_schema.citas (
  id          SERIAL PRIMARY KEY,          -- Identificador único autoincremental
  paciente_id INTEGER NOT NULL,            -- FK: paciente que asiste a la cita
  medico_id   INTEGER NOT NULL,            -- FK: médico que atiende la cita
  inicio      TIMESTAMPTZ NOT NULL,        -- Fecha/hora de inicio
  fin         TIMESTAMPTZ NOT NULL,        -- Fecha/hora de fin
  motivo      TEXT,                        -- Motivo o nota breve
  estado      TEXT,                        -- Ej: 'programada','cancelada','hecha'

  /* === Llaves foráneas (relaciones) ===
     - ON DELETE RESTRICT en paciente: evita eliminar el paciente si aún tiene citas registradas.
     - ON DELETE RESTRICT en doctor: evita eliminar al médico si aún tiene citas registradas.
       (Puedes cambiar a SET NULL o CASCADE según tu política de negocio). */
  CONSTRAINT fk_citas_paciente
    FOREIGN KEY (paciente_id)
    REFERENCES patients_schema.pacientes (id)
    ON DELETE RESTRICT,

  CONSTRAINT fk_citas_medico
    FOREIGN KEY (medico_id)
    REFERENCES doctors_schema.medicos (id)
    ON DELETE RESTRICT

  -- (Opcional más adelante) CHECK (fin > inicio) para validar rangos de tiempo.
);

GRANT ALL PRIVILEGES ON SCHEMA appointments_schema TO jpshadmin;
GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA appointments_schema TO jpshadmin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA appointments_schema TO jpshadmin;

/* =========================================================
   (Recomendado) Índices para acelerar consultas por FK
   - No cambian el comportamiento lógico, solo el performance.
   ========================================================= */
CREATE INDEX IF NOT EXISTS idx_citas_paciente ON appointments_schema.citas (paciente_id);
CREATE INDEX IF NOT EXISTS idx_citas_medico   ON appointments_schema.citas (medico_id);
CREATE INDEX IF NOT EXISTS idx_citas_inicio   ON appointments_schema.citas (inicio);
