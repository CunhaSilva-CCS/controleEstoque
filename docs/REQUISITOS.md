# Requisitos — Controle de Estoque Desktop

## 1. Visão do produto

Aplicativo **desktop offline-first** para pequenas e médias empresas gerenciarem catálogo de produtos, fornecedores, movimentos de estoque e alertas de reposição, com histórico auditável e relatórios operacionais.

| Item | Definição |
|------|-----------|
| Nome | ControleEstoque |
| Plataforma | Windows, macOS e Linux (Electron) |
| Persistência | SQLite local (arquivo no diretório de dados do usuário) |
| Idioma da UI | Português (Brasil) |
| Autenticação | Sessão local simples (usuário operador padrão; sem nuvem) |

---

## 2. Atores

| Ator | Responsabilidade |
|------|------------------|
| Operador | Cadastros, entradas/saídas, ajustes, consultas e relatórios |
| Sistema | Valida regras de estoque, gera alertas, registra auditoria |

---

## 3. Escopo funcional (MUST)

### RF-01 — Dashboard operacional
- Exibir totais: produtos ativos, quantidade total em estoque, valor estimado do inventário (custo × qtd), alertas de estoque baixo.
- Listar os 5 produtos com menor cobertura (mais críticos).
- Listar os 10 movimentos mais recentes.
- Atualizar ao abrir a tela e após qualquer movimento bem-sucedido.

### RF-02 — Cadastro de categorias
- Criar, editar, listar e desativar categorias.
- Nome único (case-insensitive), descrição opcional.
- Não permitir excluir categoria com produtos vinculados; apenas desativar.

### RF-03 — Cadastro de fornecedores
- Criar, editar, listar e desativar fornecedores.
- Campos: nome, documento (CNPJ/CPF opcional), telefone, e-mail, observação.
- Nome obrigatório e único.

### RF-04 — Cadastro de produtos
- Criar, editar, listar, filtrar e desativar produtos.
- Campos obrigatórios: SKU (único), nome, unidade (UN, KG, L, CX, MT), estoque mínimo ≥ 0, custo unitário ≥ 0, preço de venda ≥ 0.
- Campos opcionais: categoria, fornecedor preferencial, descrição, localização (prateleira/corredor).
- Estoque atual **não** é editável no formulário de produto — só via movimentos.
- Indicar visualmente produtos com estoque ≤ mínimo.

### RF-05 — Movimentos de estoque
Tipos suportados:

| Tipo | Efeito no saldo | Regras |
|------|-----------------|--------|
| `ENTRADA` | +quantidade | Quantidade > 0; fornecedor opcional; custo unitário opcional (atualiza custo médio se informado) |
| `SAIDA` | −quantidade | Quantidade > 0; **saldo suficiente**; motivo obrigatório (VENDA, USO_INTERNO, PERDA, OUTRO) |
| `AJUSTE` | define saldo absoluto ou delta | Motivo obrigatório; gera linha de auditoria com saldo anterior e novo |

Regras transversais:
- Toda movimentação gera registro imutável em `stock_movements` (append-only).
- Transação atômica: movimento + atualização de saldo (tudo ou nada).
- Não permitir quantidade zero ou negativa.
- Não permitir movimento em produto inativo.

### RF-06 — Alertas de estoque baixo
- Produto ativo com `quantity_on_hand ≤ min_stock` entra na lista de alertas.
- Dashboard e tela de produtos destacam o estado.
- Relatório dedicado “Estoque crítico”.

### RF-07 — Histórico e filtros de movimentos
- Filtrar por período, tipo, produto, fornecedor.
- Exibir: data/hora, SKU, produto, tipo, quantidade, saldo resultante, usuário, observação.

### RF-08 — Relatórios
- Inventário completo (CSV exportável).
- Estoque crítico (CSV).
- Movimentações por período (CSV).
- Resumo de valor (custo e potencial de venda).

### RF-09 — Auditoria mínima
- Cada movimento registra: timestamp ISO, tipo, quantidade, saldo_antes, saldo_depois, user_label, observação.
- Produtos/categorias/fornecedores guardam `created_at` / `updated_at`.

### RF-10 — Seed inicial
- Na primeira execução, criar categorias, fornecedores e produtos de demonstração para o usuário explorar o fluxo sem cadastro prévio.

---

## 4. Requisitos não funcionais

| ID | Requisito |
|----|-----------|
| RNF-01 | Interface responsiva a janela ≥ 1100×700; navegação lateral persistente |
| RNF-02 | Feedback imediato de sucesso/erro em todas as mutações |
| RNF-03 | Validação no backend (main process), não só na UI |
| RNF-04 | Banco local em `%APPDATA%/controle-estoque` (ou equivalente por SO) |
| RNF-05 | Tempo de abertura do dashboard < 2s com até 5.000 produtos |
| RNF-06 | Código TypeScript tipado; IPC tipado via preload |
| RNF-07 | Testes automatizados das regras de movimento e saldo |

---

## 5. Fora de escopo (esta versão)

- Multi-usuário com permissões granulares / login remoto
- Sincronização em nuvem ou multi-loja
- Nota fiscal eletrônica / integração ERP
- Código de barras por câmera
- Compras/pedidos com workflow de aprovação

---

## 6. Critérios de aceite (resumo)

1. É possível cadastrar produto e registrar entrada sem inconsistência de saldo.
2. Saída com quantidade maior que o saldo é rejeitada com mensagem clara.
3. Ajuste altera o saldo e registra saldo anterior/novo.
4. Produto abaixo do mínimo aparece no dashboard e no relatório crítico.
5. Exportação CSV gera arquivo válido com cabeçalhos em português.
6. Reiniciar o app preserva todos os dados locais.
