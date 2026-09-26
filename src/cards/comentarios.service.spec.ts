import { BadRequestException } from '@nestjs/common';
import { ComentariosService } from './comentarios.service';
import { AnexoParaUpload } from './anexos.service';

const arquivo = (nome: string): AnexoParaUpload => ({
  originalname: nome,
  mimetype: 'text/plain',
  size: 3,
  buffer: Buffer.from('abc'),
});

function montar() {
  const card = { id: 'card-1', processoId: 'proc-1' };
  const manager = { findOne: jest.fn().mockResolvedValue(card) };
  const dataSource = {
    manager,
    transaction: jest.fn(),
  };
  const anexos = {
    gerarObjectKey: jest.fn(
      (_c: string, a: AnexoParaUpload) => `k/${a.originalname}`,
    ),
    registrar: jest.fn(),
  };
  const storage = {
    salvar: jest.fn().mockResolvedValue(undefined),
    remover: jest.fn().mockResolvedValue(undefined),
  };
  const realtime = { emitirCardAtualizado: jest.fn() };
  const service = new ComentariosService(
    dataSource as never,
    anexos as never,
    storage as never,
    realtime as never,
  );
  return { service, dataSource, storage, realtime };
}

describe('ComentariosService.criar', () => {
  it('rejeita comentário sem texto e sem arquivo, sem tocar no storage', async () => {
    const { service, storage } = montar();
    await expect(
      service.criar('card-1', { texto: '  ' }, 'user-1', []),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.salvar).not.toHaveBeenCalled();
  });

  it('rejeita mais de 10 arquivos', async () => {
    const { service, storage } = montar();
    const muitos = Array.from({ length: 11 }, (_, i) => arquivo(`f${i}`));
    await expect(
      service.criar('card-1', { texto: 'x' }, 'user-1', muitos),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.salvar).not.toHaveBeenCalled();
  });

  it('remove do storage todos os objetos enviados se a transação falhar', async () => {
    const { service, dataSource, storage, realtime } = montar();
    dataSource.transaction.mockRejectedValue(new Error('falha no banco'));

    await expect(
      service.criar('card-1', { texto: 'x' }, 'user-1', [
        arquivo('a.txt'),
        arquivo('b.txt'),
      ]),
    ).rejects.toThrow('falha no banco');

    expect(storage.salvar).toHaveBeenCalledTimes(2);
    expect(storage.remover).toHaveBeenCalledWith('k/a.txt');
    expect(storage.remover).toHaveBeenCalledWith('k/b.txt');
    expect(realtime.emitirCardAtualizado).not.toHaveBeenCalled();
  });

  it('é tudo-ou-nada: se um upload falhar, apaga os que já subiram e não abre transação', async () => {
    const { service, dataSource, storage } = montar();
    storage.salvar.mockImplementation((key: string) =>
      key === 'k/b.txt'
        ? Promise.reject(new Error('minio fora'))
        : Promise.resolve(),
    );

    await expect(
      service.criar('card-1', { texto: 'x' }, 'user-1', [
        arquivo('a.txt'),
        arquivo('b.txt'),
      ]),
    ).rejects.toThrow('minio fora');

    expect(storage.remover).toHaveBeenCalledWith('k/a.txt');
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });
});
