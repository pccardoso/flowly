import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import puppeteer, { Browser } from 'puppeteer-core';

// Renderizações simultâneas no Chromium compartilhado. Cada renderização
// abre uma página nova (memória) e, quando vem de um step de integração
// (ver CardPdfEmissaoService.emitirNoStep), roda dentro de uma transação
// que segura uma conexão do pool do banco — limitar aqui protege os dois.
export const MAX_RENDERIZACOES_SIMULTANEAS = 3;
export const TIMEOUT_PADRAO_RENDERIZACAO_MS = 30000;

export interface OpcoesRenderizacaoPdf {
  // Vale tanto pra esperar vaga na fila de renderizações simultâneas quanto
  // pra própria renderização (carregar o HTML + gerar o PDF).
  timeoutMs?: number;
}

// Wrapper fino sobre Puppeteer (Chromium headless, ver PUPPETEER_EXECUTABLE_
// PATH no .env/docker-compose.yml). Browser é iniciado uma vez e reutilizado
// entre renderizações (custo de subir o processo do Chromium é alto); cada
// renderização abre sua própria page e fecha no final, isolando um render do
// outro.
@Injectable()
export class PdfRendererService implements OnModuleDestroy {
  private readonly logger = new Logger(PdfRendererService.name);
  private browserPromise: Promise<Browser> | null = null;
  private renderizacoesAtivas = 0;
  private readonly filaDeEspera: (() => void)[] = [];

  // Semáforo simples: se não há vaga, espera até `timeoutMs` (falha rápido em
  // vez de esperar indefinidamente). Ao liberar, a vaga passa direto pro
  // próximo da fila sem decrementar o contador.
  private async adquirirVaga(timeoutMs: number): Promise<void> {
    if (this.renderizacoesAtivas < MAX_RENDERIZACOES_SIMULTANEAS) {
      this.renderizacoesAtivas += 1;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const entrar = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        const indice = this.filaDeEspera.indexOf(entrar);
        if (indice >= 0) this.filaDeEspera.splice(indice, 1);
        reject(
          new Error(
            'Fila de geração de PDF cheia — tente novamente em instantes',
          ),
        );
      }, timeoutMs);
      this.filaDeEspera.push(entrar);
    });
  }

  private liberarVaga(): void {
    const proximo = this.filaDeEspera.shift();
    if (proximo) {
      proximo();
    } else {
      this.renderizacoesAtivas -= 1;
    }
  }

  private async obterBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      this.browserPromise = puppeteer.launch({
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }
    return this.browserPromise;
  }

  // JavaScript desligado de propósito: o recurso é "HTML" (com <style>
  // embutido, se o usuário quiser), nunca script — evita que um modelo (ou
  // um valor de campo vindo de formulário externo público sem login, ver
  // FormulariosController) rode JS dentro do Chromium do servidor.
  //
  // Sem wrapping forçado: o modelo já é o documento inteiro (pode ter
  // <style>, <html>/<head>/<body> completos ou só um fragmento — Chromium
  // aceita os dois). Só garantimos um <meta charset="utf-8"> quando o
  // usuário não montou um <head> próprio, pra acento não quebrar.
  async renderizarPdf(
    html: string,
    opcoes: OpcoesRenderizacaoPdf = {},
  ): Promise<Buffer> {
    const timeout = opcoes.timeoutMs ?? TIMEOUT_PADRAO_RENDERIZACAO_MS;
    await this.adquirirVaga(timeout);
    try {
      const browser = await this.obterBrowser();
      const page = await browser.newPage();
      try {
        await page.setJavaScriptEnabled(false);
        const documento = /<head[\s>]/i.test(html)
          ? html
          : `<meta charset="utf-8">${html}`;
        await page.setContent(documento, { waitUntil: 'load', timeout });
        const pdf = await page.pdf({
          format: 'A4',
          printBackground: true,
          timeout,
        });
        return Buffer.from(pdf);
      } finally {
        await page.close();
      }
    } finally {
      this.liberarVaga();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.browserPromise) return;
    try {
      const browser = await this.browserPromise;
      await browser.close();
    } catch (erro) {
      this.logger.warn(
        `Falha ao fechar o browser do Puppeteer: ${(erro as Error).message}`,
      );
    }
  }
}
