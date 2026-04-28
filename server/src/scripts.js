import { createHash } from 'node:crypto';

const REQUIRED_MANIFEST_FIELDS = ['name', 'version', 'entrypoint', 'permissions', 'limits'];

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function hashBundle(files) {
  return createHash('sha256').update(stableJson(files)).digest('hex');
}

export class ScriptRegistry {
  #scripts = new Map();

  validatePackage(scriptPackage) {
    const manifest = scriptPackage?.manifest;
    const files = scriptPackage?.files;
    if (!manifest || typeof manifest !== 'object') {
      return { ok: false, reason: 'missing_manifest' };
    }
    for (const field of REQUIRED_MANIFEST_FIELDS) {
      if (manifest[field] == null) {
        return { ok: false, reason: `missing_${field}` };
      }
    }
    if (!Array.isArray(manifest.permissions)) {
      return { ok: false, reason: 'permissions_must_be_array' };
    }
    if (!files || typeof files !== 'object' || !files[manifest.entrypoint]) {
      return { ok: false, reason: 'missing_entrypoint' };
    }
    if (!Number.isInteger(manifest.limits.max_runtime_s) || manifest.limits.max_runtime_s <= 0) {
      return { ok: false, reason: 'invalid_runtime_limit' };
    }

    const sha256 = hashBundle(files);
    if (manifest.sha256 && manifest.sha256 !== sha256) {
      return { ok: false, reason: 'hash_mismatch', expected: manifest.sha256, actual: sha256 };
    }

    return {
      ok: true,
      script: {
        scriptId: manifest.script_id ?? `sha256:${sha256}`,
        name: manifest.name,
        version: manifest.version,
        entrypoint: manifest.entrypoint,
        permissions: [...manifest.permissions],
        limits: { ...manifest.limits },
        sha256,
        files: { ...files },
        approved: false,
        revoked: false,
        createdAt: new Date().toISOString()
      }
    };
  }

  deploy(scriptPackage) {
    const validation = this.validatePackage(scriptPackage);
    if (!validation.ok) {
      return validation;
    }
    this.#scripts.set(validation.script.scriptId, validation.script);
    return { ok: true, script: this.get(validation.script.scriptId) };
  }

  approve(scriptId, approvedBy) {
    const script = this.#scripts.get(scriptId);
    if (!script) {
      return { ok: false, reason: 'unknown_script' };
    }
    script.approved = true;
    script.approvedBy = approvedBy;
    script.approvedAt = new Date().toISOString();
    return { ok: true, script: this.get(scriptId) };
  }

  revoke(scriptId, revokedBy, reason = 'revoked') {
    const script = this.#scripts.get(scriptId);
    if (!script) {
      return { ok: false, reason: 'unknown_script' };
    }
    script.revoked = true;
    script.revokedBy = revokedBy;
    script.revokedReason = reason;
    script.revokedAt = new Date().toISOString();
    return { ok: true, script: this.get(scriptId) };
  }

  canRun(scriptId, requestedPermissions = []) {
    const script = this.#scripts.get(scriptId);
    if (!script) {
      return { ok: false, reason: 'unknown_script' };
    }
    if (!script.approved) {
      return { ok: false, reason: 'script_not_approved' };
    }
    if (script.revoked) {
      return { ok: false, reason: 'script_revoked' };
    }
    const missing = requestedPermissions.filter((permission) => !script.permissions.includes(permission));
    if (missing.length > 0) {
      return { ok: false, reason: 'permission_denied', missing };
    }
    return { ok: true, script: this.get(scriptId) };
  }

  get(scriptId) {
    const script = this.#scripts.get(scriptId);
    return script ? JSON.parse(JSON.stringify(script)) : null;
  }

  list() {
    return [...this.#scripts.values()].map((script) => JSON.parse(JSON.stringify(script)));
  }
}

