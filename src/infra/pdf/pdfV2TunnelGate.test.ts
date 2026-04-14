import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { finalizeSummaryAnswers } from '../../domain/projectEngines';
import type { Session } from '../../domain/session';
import { generatePdfV2FromSession } from './pdfV2Service';

describe('PDF V2 tunnel consistency (integration)', () => {
  it('altura baixa sem túnel: gera PDF válido (3840 mm, 2 níveis, firstLevelOnGround)', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-tunnel-gate-'));
    try {
      const answers = finalizeSummaryAnswers({
        projectType: 'MEDIDAS_DIGITADAS',
        dimensionsFromPlant: false,
        lengthMm: 12_000,
        widthMm: 10_000,
        corridorMm: 3000,
        lineStrategy: 'MELHOR_LAYOUT',
        hasTunnel: false,
        moduleDepthMm: 1100,
        heightMode: 'DIRECT',
        heightMm: 3840,
        levels: 2,
        firstLevelOnGround: true,
        capacityKg: 1200,
        columnProtector: false,
        guardRailSimple: false,
        guardRailDouble: false,
      });
      const session: Session = {
        phone: 'test-pdf-tunnel-gate',
        state: 'DONE',
        answers,
        stack: [],
        updatedAt: Date.now(),
      };
      const result = await generatePdfV2FromSession(session, {
        storagePath: tmp,
      });
      expect(result.sizeBytes).toBeGreaterThan(500);
      expect(fs.existsSync(result.absolutePath)).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
