import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Client } from 'minio';
import { Readable } from 'stream';

// Client MinIO compartilhado por toda a aplicação. Garante a existência do
// bucket na subida da aplicação para que as rotas de anexo não precisem se
// preocupar com isso a cada upload.
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: Client;
  private readonly bucket: string;

  constructor() {
    this.bucket = process.env.MINIO_BUCKET ?? 'flowly-anexos';
    this.client = new Client({
      endPoint: process.env.MINIO_ENDPOINT ?? 'localhost',
      port: Number(process.env.MINIO_PORT ?? 9000),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY ?? 'flowly',
      secretKey: process.env.MINIO_SECRET_KEY ?? 'flowly123',
    });
  }

  async onModuleInit(): Promise<void> {
    const existe = await this.client.bucketExists(this.bucket);
    if (!existe) {
      await this.client.makeBucket(this.bucket);
      this.logger.log(`Bucket "${this.bucket}" criado no MinIO`);
    }
  }

  async salvar(
    objectKey: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<void> {
    await this.client.putObject(this.bucket, objectKey, buffer, buffer.length, {
      'Content-Type': mimeType,
    });
  }

  async obterStream(objectKey: string): Promise<Readable> {
    return this.client.getObject(this.bucket, objectKey);
  }

  async remover(objectKey: string): Promise<void> {
    await this.client.removeObject(this.bucket, objectKey);
  }

  // Cópia server-side (MinIO copia internamente, sem baixar/reenviar bytes
  // pelo Node) — usado pelo step ACAO_ANEXAR_ARQUIVO pra duplicar o arquivo-
  // modelo do step num objectKey novo por card. Cópia (nunca referência ao
  // mesmo objectKey) é obrigatório: CardAnexosService.remover apaga o
  // objectKey do MinIO quando um anexo é removido — se dois CardAnexo
  // compartilhassem o mesmo objeto, remover um apagaria o arquivo do outro.
  async copiar(
    origemObjectKey: string,
    destinoObjectKey: string,
  ): Promise<void> {
    await this.client.copyObject(
      this.bucket,
      destinoObjectKey,
      `/${this.bucket}/${origemObjectKey}`,
    );
  }

  // Remove todo objeto sob um prefixo — usado pra limpar o staging de
  // arquivo do step ACAO_ANEXAR_ARQUIVO (integracoes/{processoId}/
  // steps-arquivos/...) quando o processo inteiro é removido: como esses
  // arquivos não têm uma linha de banco própria (só existem enquanto
  // referenciados dentro de IntegracaoStep.config.arquivos), um cleanup por
  // objectKey individual não bastaria pra pegar upload abandonado (nunca
  // usado em nenhum step) — varrer pelo prefixo cobre os dois casos.
  async removerPorPrefixo(prefixo: string): Promise<void> {
    const objectKeys: string[] = [];
    await new Promise<void>((resolve, reject) => {
      const stream = this.client.listObjectsV2(this.bucket, prefixo, true);
      stream.on('data', (item) => {
        if (item.name) objectKeys.push(item.name);
      });
      stream.on('end', () => resolve());
      stream.on('error', reject);
    });
    if (objectKeys.length > 0) {
      await this.client.removeObjects(this.bucket, objectKeys);
    }
  }
}
