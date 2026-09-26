import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { StepTipo } from '../enums/step-tipo.enum';
import { Integracao } from './integracao.entity';
import { User } from '../../users/entities/user.entity';

@Entity('integracao_steps')
@Unique(['integracaoId', 'apelido'])
export class IntegracaoStep {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Integracao, (integracao) => integracao.steps, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'integracao_id' })
  integracao!: Integracao;

  @Column({ name: 'integracao_id' })
  integracaoId!: string;

  // Nome curto único dentro da integração — é como outros steps referenciam
  // a saída deste (ver config.$stepRef em integracao-engine.ts). Não é o id
  // (uuid) porque o usuário pode reordenar/reconectar sem trocar o vínculo.
  @Column()
  apelido!: string;

  @Column({ type: 'varchar' })
  tipo!: StepTipo;

  // Formato depende de `tipo` — ver StepExecutor.validarConfig de cada tipo
  // em step-executors.ts. Qualquer valor pode ser um literal, uma string com
  // placeholders {chave} (interpolados contra card.campos) ou uma referência
  // { "$stepRef": "<apelido>", "$campo": "<chave>" } resolvida a partir da
  // saída de outro step conectado (ver integracao-engine.ts).
  @Column({ type: 'jsonb', default: {} })
  config!: Record<string, unknown>;

  // Conta de serviço: usuário cuja permissão é checada antes de executar
  // este step (obrigatório para todo step que não seja GATILHO_*, validado
  // em IntegracoesService.validarStep). Nunca é o usuário "logado" que
  // disparou o evento — é fixo por step, configurado por quem monta a
  // integração.
  @Column({ name: 'usuario_servico_id', type: 'uuid', nullable: true })
  usuarioServicoId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'usuario_servico_id' })
  usuarioServico!: User | null;

  // Posição no editor visual — o backend não interpreta, só guarda pra o
  // front redesenhar o grafo do jeito que o usuário organizou.
  @Column({ name: 'posicao_x', type: 'float', default: 0 })
  posicaoX!: number;

  @Column({ name: 'posicao_y', type: 'float', default: 0 })
  posicaoY!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
