import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadModels } from '../../src/render/assets';
import type { ModelId } from '../../src/render/contract';

/** Serves public/assets/models/<id>.glb bytes for './assets/models/<id>.glb' and records requests. */
function fakeFetch(missing: readonly string[] = []) {
  const requests: string[] = [];
  const fetchBytes = async (url: string): Promise<ArrayBuffer> => {
    requests.push(url);
    const id = /assets\/models\/([a-z0-9_]+)\.glb$/.exec(url)?.[1];
    if (!id || missing.includes(id)) throw new Error(`${url}: HTTP 404`);
    const bytes = readFileSync(`public/assets/models/${id}.glb`);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  };
  return { requests, fetchBytes };
}

describe('model loading', () => {
  it('requests every model URL exactly once, relative to the base, and parses the real GLBs', async () => {
    const { requests, fetchBytes } = fakeFetch();
    const ids: ModelId[] = ['courier_body', 'soul_mask', 'needler', 'courier_body'];
    const lib = await loadModels(ids, undefined, fetchBytes, './');
    expect(requests.sort()).toEqual(['./assets/models/courier_body.glb', './assets/models/needler.glb', './assets/models/soul_mask.glb']);
    for (const id of ['courier_body', 'soul_mask', 'needler'] as const) {
      expect(lib.source(id)).toBe('glb');
      expect(lib.template(id).name).toBe(id);
    }
  });

  it('falls back to a placeholder (with one attempt) when a model is missing', async () => {
    const { requests, fetchBytes } = fakeFetch(['keeper']);
    const lib = await loadModels(['keeper', 'urn'], undefined, fetchBytes, './');
    expect(requests).toHaveLength(2);
    expect(lib.source('keeper')).toBe('placeholder');
    expect(lib.source('urn')).toBe('glb');
    expect(lib.template('keeper').name).toBe('keeper');
  });
});
