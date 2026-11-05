// Configuração dos testes (Vitest). `pnpm test` roda todos os arquivos tests/**/*.test.ts uma vez.
// getViteConfig() faz os testes enxergarem o projeto como o Astro enxerga (mesmas configurações).
// Referência: https://docs.astro.build/en/guides/testing/#vitest
/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";

export default getViteConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
