import * as os from 'os';
import * as path from 'path';
import { resolveStoragePath } from './storagePath';

describe('resolveStoragePath', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it('uses cwd/storage locally', () => {
    delete process.env.VERCEL;
    delete process.env.PALLET_STORAGE_PATH;
    delete process.env.AWS_LAMBDA_FUNCTION_NAME;
    const p = resolveStoragePath();
    expect(p).toBe(path.resolve(process.cwd(), 'storage'));
  });

  it('uses tmp on Vercel', () => {
    process.env.VERCEL = '1';
    delete process.env.PALLET_STORAGE_PATH;
    const p = resolveStoragePath();
    expect(p).toBe(
      path.join(os.tmpdir(), 'pallet-bot-whatsapp', 'storage')
    );
  });

  it('PALLET_STORAGE_PATH wins', () => {
    process.env.VERCEL = '1';
    process.env.PALLET_STORAGE_PATH = '/custom/store';
    expect(resolveStoragePath()).toBe('/custom/store');
  });
});
