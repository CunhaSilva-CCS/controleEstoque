# Controle de Estoque — Requisitos do Sistema

## 1. Visão geral

Aplicativo **desktop** para gestão de estoque de pequenas e médias operações (loja, depósito, oficina). O sistema centraliza cadastros, movimentações, alertas de estoque baixo e relatórios, com persistência local em SQLite e interface offline-first.

**Nome do produto:** Controle de Estoque  
**Plataforma:** Windows / Linux / macOS (Electron)  
**Idioma da interface:** Português (Brasil)

---

## 2. Objetivos

1. Manter o saldo de cada produto sempre consistente com as movimentações registradas.
2. Permitir cadastro completo de produtos, categorias e fornecedores.
3. Registrar entradas, saídas e ajustes com rastreabilidade (motivo, data, referência).
4. Alertar quando o estoque atingir o mínimo definido.
5. Oferecer visão gerencial (dashboard e relatórios) sem depender de internet.

---

## 3. Atores

| Ator | Descrição |
|------|-----------|
| Operador | Usuário padrão: cadastra produtos, registra entradas/saídas, consulta saldos. |
| Gestor | Mesmo acesso do operador + consulta relatórios e indicadores do dashboard. |

> Na v1 não há login multi-usuário: o aplicativo abre direto na área de trabalho. A autenticação fica prevista como evolução (RF-E01).

---

## 4. Requisitos funcionais

### 4.1 Produtos (RF-P)

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-P01 | Cadastrar produto com: código SKU (único), nome, descrição, categoria, fornecedor, unidade, preço de custo, preço de venda, estoque mínimo, estoque inicial (opcional). | Must |
| RF-P02 | Editar dados cadastrais do produto sem alterar o saldo (salvo ajuste explícito). | Must |
| RF-P03 | Inativar produto (soft delete). Produtos inativos não aparecem em novas movimentações. | Must |
| RF-P04 | Listar produtos com busca por nome/SKU e filtro por categoria, status e estoque baixo. | Must |
| RF-P05 | Impedir cadastro de SKU duplicado. | Must |
| RF-P06 | Exibir saldo atual, valor de estoque (saldo × custo) e status (OK / Baixo / Zerado). | Must |

### 4.2 Categorias (RF-C)

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-C01 | Cadastrar, editar e inativar categorias. | Must |
| RF-C02 | Nome de categoria único. | Must |
| RF-C03 | Impedir inativação se houver produto ativo vinculado (ou exigir remapeamento). | Should |

### 4.3 Fornecedores (RF-F)

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-F01 | Cadastrar fornecedor: nome, documento, telefone, e-mail, observação. | Must |
| RF-F02 | Editar e inativar fornecedores. | Must |
| RF-F03 | Associar fornecedor a produtos. | Must |

### 4.4 Movimentações de estoque (RF-M)

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-M01 | Registrar **entrada**: aumenta saldo; exige quantidade > 0, motivo e (opcional) documento/nota. | Must |
| RF-M02 | Registrar **saída**: diminui saldo; bloqueia se quantidade > saldo disponível. | Must |
| RF-M03 | Registrar **ajuste**: define o novo saldo absoluto; gera movimento com diferença calculada. | Must |
| RF-M04 | Toda movimentação grava: produto, tipo, quantidade, saldo anterior, saldo posterior, motivo, data/hora, referência. | Must |
| RF-M05 | Histórico imutável: movimentações não podem ser editadas nem excluídas na v1. | Must |
| RF-M06 | Listar movimentações com filtros por período, produto e tipo. | Must |

### 4.5 Dashboard e alertas (RF-D)

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-D01 | Exibir totais: produtos ativos, valor total em estoque, movimentações do dia, itens com estoque baixo. | Must |
| RF-D02 | Listar os 5 produtos com estoque mais crítico. | Must |
| RF-D03 | Listar últimas movimentações. | Must |
| RF-D04 | Destacar visualmente produtos com saldo ≤ estoque mínimo. | Must |
| RF-D05 | Tela **Alertas** com lista completa, déficit até o mínimo e quantidade sugerida de reposição. | Must |
| RF-D06 | Banner global e badge na navegação enquanto houver produtos em alerta. | Must |
| RF-D07 | Permitir ajustar o estoque mínimo diretamente a partir do alerta. | Must |
| RF-D08 | Registrar entrada de reposição a partir do alerta (quantidade sugerida pré-preenchida). | Must |
| RF-D09 | Após movimentação que deixe saldo ≤ mínimo, exibir aviso imediato. | Must |

### 4.6 Relatórios (RF-R)

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-R01 | Relatório de posição de estoque (saldo, custo, valor). | Must |
| RF-R02 | Relatório de movimentações por período. | Must |
| RF-R03 | Relatório de produtos abaixo do mínimo. | Must |
| RF-R04 | Exportar relatório exibido para CSV. | Should |

---

## 5. Requisitos não funcionais

| ID | Requisito |
|----|-----------|
| RNF-01 | Interface responsiva para resolução mínima 1280×720. |
| RNF-02 | Persistência local em SQLite no diretório de dados do usuário. |
| RNF-03 | Operação 100% offline. |
| RNF-04 | Tempo de abertura da lista de produtos < 1s para até 5.000 itens. |
| RNF-05 | Transações atômicas em movimentações (saldo + histórico juntos). |
| RNF-06 | Mensagens de erro em português, acionáveis. |
| RNF-07 | Dados de demonstração opcionais no primeiro uso. |

---

## 6. Regras de negócio

1. **Saldo nunca negativo** — saída com quantidade maior que o saldo é rejeitada.
2. **SKU único** entre produtos ativos e inativos.
3. **Estoque mínimo ≥ 0**; saldo inicial ≥ 0.
4. **Preço de venda** pode ser zero (produto interno), mas custo ≥ 0.
5. **Status do produto:**
   - `Zerado` se saldo = 0
   - `Baixo` se 0 < saldo ≤ estoque mínimo
   - `OK` se saldo > estoque mínimo
6. **Entrada com estoque inicial** no cadastro gera movimentação tipo `entrada` com motivo “Estoque inicial”.
7. **Ajuste** calcula `quantidade = novoSaldo - saldoAtual` (pode ser positiva ou negativa no histórico).

---

## 7. Escopo fora da v1

- Multi-empresa / multi-depósito
- Código de barras / leitor
- Integração fiscal (NFe)
- Login e permissões por perfil
- Sincronização em nuvem
- Contagem inventarial guiada com divergências

---

## 8. Critérios de aceite (resumo)

- [ ] Cadastro de produto com SKU duplicado é bloqueado com mensagem clara.
- [ ] Saída acima do saldo é bloqueada e o saldo permanece inalterado.
- [ ] Após entrada/saída/ajuste, dashboard e lista de produtos refletem o novo saldo.
- [ ] Produto inativo não aparece no seletor de novas movimentações.
- [ ] Exportação CSV do relatório de posição gera arquivo válido.
- [ ] App inicia sem internet e carrega dados locais.
