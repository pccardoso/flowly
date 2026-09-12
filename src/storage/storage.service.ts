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
}
