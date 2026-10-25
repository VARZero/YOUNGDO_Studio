import { validateFullConfig } from './studioSettings';
import { generateRTL, validateSchedulerConfig } from './rtlGenerator';
import { generateDecoderRTL, immediateExpression } from './decoderGenerator';
import { buildSourceFiles, projectArchiveName, projectTopFileName } from './sourceBundle';

// Both the browser automation page and Studio use the same RTL and bundle builders.
export function generateProject(input: unknown) {
  if (!validateFullConfig(input)) throw new Error('영도 스튜디오에서 내보낸 JSON 형식이 아닙니다. 예제 JSON을 확인하세요.');
  const projectName = input.projectName ?? 'my_project';
  if (!projectName.trim()) throw new Error('프로젝트 이름을 입력하세요.');
  const config = { ...input.scheduler, ...input.decoder };
  const error = validateSchedulerConfig(config);
  if (error) throw new Error(error);
  const external = config.decoderSource === 'external';
  const invalidImmediate = external ? undefined : input.formats.find(format => format.immediateParts?.length &&
    !immediateExpression(format, config.instImm, config.instBitWidth));
  if (invalidImmediate) throw new Error(`${invalidImmediate.name} 즉시값 비트 범위가 겹치거나 유효하지 않습니다.`);
  const top = generateRTL(config);
  const decoder = external ? null : generateDecoderRTL(input.decoder, input.formats, input.instructions, config.coresList);
  const files = buildSourceFiles(top, decoder, config.isaName, projectName, JSON.stringify(input, null, 2), config.platform);
  return { files, platform: config.platform ?? 'eulsukdo', archiveName: projectArchiveName(projectName, config.platform), topName: projectTopFileName(projectName, config.platform) };
}

export function readAutoRequest(url: URL) {
  const query = url.searchParams;
  const fragment = new URLSearchParams(url.hash.slice(1));
  if (query.has('config') && fragment.has('config')) throw new Error('config는 쿼리 또는 # 뒤에 한 번만 전달하세요.');
  return { config: query.get('config') ?? fragment.get('config'), file: query.get('file') };
}
