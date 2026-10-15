import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Keep fresh test workers in the same module tree as the calling test.
export function testRuntime(moduleUrl: string) {
  const extension = extname(fileURLToPath(moduleUrl));
  if (extension !== '.ts' && extension !== '.js') throw new Error('Unsupported test module format');
  return {
    execArgv: extension === '.ts' ? ['--import', 'tsx'] : [],
    moduleUrl(relativePath: string): string {
      return new URL(extension === '.ts' ? relativePath.replace(/\.js$/, '.ts') : relativePath, moduleUrl).href;
    },
  };
}
