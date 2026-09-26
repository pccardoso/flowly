import { IsObject, IsOptional, IsUUID } from 'class-validator';

// saidasAnteriores é montado incrementalmente pelo front: a cada step
// testado com sucesso, a resposta inteira { entrada, saida } vira uma
// entrada nova nesse mapa (chave = apelido do step), reenviada na chamada
// seguinte pra que $stepRef resolva contra ela (ver
// IntegracaoTesteService.testarStep). Vazio/omitido é válido só quando o
// step testado é o gatilho (não tem nenhuma entrada antes dele).
export class TestarStepDto {
  @IsUUID()
  cardId!: string;

  @IsOptional()
  @IsObject()
  saidasAnteriores?: Record<string, Record<string, unknown>>;
}
