// LAYOUT dos Dados Abertos CNPJ da Receita Federal (dicionário de dados oficial):
// CSV sem cabeçalho, separador ";", aspas '"', codificação LATIN1. Um ZIP por parte (Empresas0..9 etc.).
// Conferir na primeira carga real: se a Receita mudar o layout, só esta lista muda.

export const FILES = {
  empresa: { prefix: 'Empresas', columns: ['cnpj_basico', 'razao_social', 'natureza_juridica', 'qualificacao_responsavel', 'capital_social', 'porte', 'ente_federativo'] },
  estabelecimento: {
    prefix: 'Estabelecimentos',
    columns: [
      'cnpj_basico', 'cnpj_ordem', 'cnpj_dv', 'matriz_filial', 'nome_fantasia', 'situacao', 'data_situacao', 'motivo_situacao', 'cidade_exterior', 'pais',
      'data_inicio', 'cnae_principal', 'cnaes_secundarios', 'tipo_logradouro', 'logradouro', 'numero', 'complemento', 'bairro', 'cep', 'uf', 'municipio',
      'ddd1', 'telefone1', 'ddd2', 'telefone2', 'ddd_fax', 'fax', 'email', 'situacao_especial', 'data_situacao_especial',
    ],
  },
  socio: {
    prefix: 'Socios',
    columns: ['cnpj_basico', 'tipo', 'nome', 'documento', 'qualificacao', 'data_entrada', 'pais', 'representante_documento', 'representante_nome', 'representante_qualificacao', 'faixa_etaria'],
  },
  simples: { prefix: 'Simples', columns: ['cnpj_basico', 'opcao_simples', 'data_opcao_simples', 'data_exclusao_simples', 'opcao_mei', 'data_opcao_mei', 'data_exclusao_mei'] },
  cnae: { prefix: 'Cnaes', columns: ['codigo', 'descricao'] },
  municipio: { prefix: 'Municipios', columns: ['codigo', 'descricao'] },
  natureza: { prefix: 'Naturezas', columns: ['codigo', 'descricao'] },
  qualificacao: { prefix: 'Qualificacoes', columns: ['codigo', 'descricao'] },
} as const;
export type FileKind = keyof typeof FILES;

export const PORTE: Record<string, string> = { '00': 'NÃO INFORMADO', '01': 'MICRO EMPRESA', '03': 'EMPRESA DE PEQUENO PORTE', '05': 'DEMAIS' };
export const SITUACAO: Record<string, string> = { '01': 'NULA', '02': 'ATIVA', '03': 'SUSPENSA', '04': 'INAPTA', '08': 'BAIXADA' };
export const FAIXA_ETARIA: Record<string, string> = {
  '1': '0 a 12 anos',
  '2': '13 a 20 anos',
  '3': '21 a 30 anos',
  '4': '31 a 40 anos',
  '5': '41 a 50 anos',
  '6': '51 a 60 anos',
  '7': '61 a 70 anos',
  '8': '71 a 80 anos',
  '9': 'Maiores de 80 anos',
};
/** Sócio: 1 = pessoa jurídica, 2 = pessoa física, 3 = estrangeiro. */
export const TIPO_SOCIO: Record<string, string> = { '1': 'PJ', '2': 'PF', '3': 'ESTRANGEIRO' };
