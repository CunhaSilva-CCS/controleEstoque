# Controle de Estoque — Requisitos do Sistema

## 1. Visão geral

Aplicativo **desktop** do ecossistema **ERP Cortexis Tech** para gestão de estoque de pequenas e médias operações (indústria leve, depósito, oficina). Centraliza cadastros, documentos de estoque, alertas e relatórios, com persistência local em SQLite e uso **offline-first**.

**Nome do produto:** ERP Cortexis Tech — Módulo Controle de Estoque  
**Plataforma:** Windows / Linux / macOS (Electron)  
**Idioma da interface:** Português (Brasil)

---

## 2. Objetivos

1. Manter o saldo de cada produto sempre consistente com os documentos registrados.
2. Separar **insumo** e **produto acabado** no cadastro e nas operações.
3. Entrar insumos por **fatura de compra**; produzir acabados por **fabricação** (receita).
4. Permitir **ajuste de inventário** manual com rastreabilidade.
5. Alertar estoque baixo / zerado e oferecer painel e relatórios sem internet.
6. Controlar acesso local por perfil (administrador e operador).

---

## 3. Atores

| Ator | Descrição |
|------|-----------|
| Administrador | Acesso completo: operações, usuários, dados de demonstração, marca da empresa, cópia de segurança e atualizações. |
| Operador | Cadastros, faturas, fabricação, ajustes, painel, relatórios, tema e alteração da própria senha. Sem usuários, backup, marca, seed nem atualizações. |

O aplicativo exige login. O usuário padrão `admin` / `admin123` deve trocar a senha no primeiro acesso.

> Multiusuário é **local** (vários usuários no mesmo computador / mesmo banco SQLite). Não há sincronização entre máquinas.

---

## 4. Requisitos funcionais

### 4.1 Autenticação e usuários (RF-A)

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-A01 | Login com usuário e senha; sessão local no processo Electron. | Must |
| RF-A02 | Troca obrigatória da senha padrão no primeiro acesso (e enquanto a senha for a padrão). | Must |
| RF-A03 | Usuário autenticado pode alterar a própria senha (mín. 6 caracteres; diferente da atual; não pode ser a senha padrão). | Must |
| RF-A04 | Administrador cadastra usuários (nome, usuário, senha, perfil admin/operador) e ativa/inativa. | Must |
| RF-A05 | Impedir desativar o último administrador ativo. | Must |
| RF-A06 | Operações administrativas (usuários, seed, marca, backup, updates) bloqueadas no IPC para operador. | Must |

### 4.2 Produtos (RF-P)

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-P01 | Cadastrar produto com: código único, nome, descrição, categoria, fornecedor, tipo (insumo/acabado), unidade, preço de custo, preço de venda, estoque mínimo. | Must |
| RF-P02 | Cadastro **não** altera saldo. Estoque inicia em 0. | Must |
| RF-P03 | Editar dados cadastrais sem alterar o saldo (salvo ajuste explícito). | Must |
| RF-P04 | Inativar produto (soft delete). Inativos não entram em novas faturas, fabricações ou ajustes. | Must |
| RF-P05 | Listar com busca por nome/código e filtro por categoria, inativos e estoque baixo. | Must |
| RF-P06 | Impedir código duplicado (ativos e inativos). | Must |
| RF-P07 | Exibir saldo, valor de estoque (saldo × custo) e status (Normal / Baixo / Zerado). | Must |

### 4.3 Categorias (RF-C)

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-C01 | Cadastrar, editar e inativar categorias. | Must |
| RF-C02 | Nome de categoria único. | Must |
| RF-C03 | Impedir inativação se houver produto ativo vinculado. | Must |

### 4.4 Fornecedores (RF-F)

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-F01 | Cadastrar fornecedor: nome, documento, telefone, e-mail, observação. | Must |
| RF-F02 | Editar e inativar fornecedores. | Must |
| RF-F03 | Associar fornecedor a produtos e a faturas de compra. | Must |

### 4.5 Receitas de fabricação (RF-RC)

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-RC01 | Cadastrar/editar receita de produto **acabado** com itens de **insumo** e quantidade por unidade produzida. | Must |
| RF-RC02 | Uma receita por produto acabado. | Must |
| RF-RC03 | Impedir insumo = próprio acabado; aceitar apenas componentes do tipo insumo. | Must |

### 4.6 Faturas de compra (RF-I)

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-I01 | Lançar fatura com número, data, fornecedor (opcional), observações e itens (insumo, quantidade, custo unitário). | Must |
| RF-I02 | Cada item gera entrada de estoque e atualiza o custo do produto. | Must |
| RF-I03 | Somente **insumos** entram por fatura. | Must |
| RF-I04 | Unicidade de fatura por número + fornecedor. | Must |
| RF-I05 | Histórico de fatura imutável na v1 (sem estorno/edição). | Must |

### 4.7 Fabricação (RF-FB)

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-FB01 | Registrar fabricação de produto acabado com quantidade e observações. | Must |
| RF-FB02 | Exigir receita cadastrada antes de fabricar. | Must |
| RF-FB03 | Consumir insumos da receita × quantidade; bloquear se saldo insuficiente. | Must |
| RF-FB04 | Creditar o acabado na mesma transação atômica. | Must |
| RF-FB05 | Ordem de fabricação imutável na v1 (sem cancelamento). | Must |

### 4.8 Ajustes e histórico (RF-M)

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-M01 | Registrar **ajuste**: define novo saldo absoluto (≥ 0); quantidade no histórico = novo − anterior. | Must |
| RF-M02 | Entrada/saída manuais avulsas **não** são permitidas pela API de movimento; só fatura ou fabricação. | Must |
| RF-M03 | Toda movimentação grava: produto, tipo, quantidade, saldo anterior/posterior, motivo, origem, referência, data/hora. | Must |
| RF-M04 | Histórico imutável: movimentações não podem ser editadas nem excluídas na v1. | Must |
| RF-M05 | Listar histórico com filtros por período, produto e tipo. | Must |

### 4.9 Painel e alertas (RF-D)

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-D01 | Exibir: produtos ativos, valor total em estoque, estoque baixo/zerado, movimentações do dia. | Must |
| RF-D02 | Listar os 5 produtos mais críticos e as últimas movimentações. | Must |
| RF-D03 | Destacar visualmente produtos com saldo ≤ estoque mínimo. | Must |
| RF-D04 | No primeiro uso, administrador pode carregar ou recusar dados de demonstração. | Must |

### 4.10 Relatórios (RF-R)

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-R01 | Relatório de posição de estoque (código, saldo, custo, valor, status). | Must |
| RF-R02 | Relatório de movimentações por período. | Must |
| RF-R03 | Relatório de produtos abaixo do mínimo / zerados. | Must |
| RF-R04 | Exportar relatório exibido para CSV. | Must |

### 4.11 Configurações (RF-S)

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-S01 | Tema claro / escuro. | Must |
| RF-S02 | Administrador define marca da empresa (nome + logo até 2 MB). | Must |
| RF-S03 | Administrador exporta e restaura cópia de segurança do banco `.db`. | Must |
| RF-S04 | Administrador verifica/instala atualizações em build empacotado. | Should |

---

## 5. Requisitos não funcionais

| ID | Requisito |
|----|-----------|
| RNF-01 | Interface para resolução mínima 1280×720. |
| RNF-02 | Persistência local em SQLite no diretório de dados do usuário. |
| RNF-03 | Operação 100% offline. |
| RNF-04 | Tempo de abertura da lista de produtos < 1s para até 5.000 itens. |
| RNF-05 | Transações atômicas (saldo + histórico; fabricação consumo + produção juntos). |
| RNF-06 | Mensagens de erro em português, acionáveis. |
| RNF-07 | Dados de demonstração opcionais no primeiro uso (admin). |
| RNF-08 | Interface e toasts em português (Brasil); marca “ERP Cortexis Tech” preservada. |

---

## 6. Regras de negócio

1. **Saldo nunca negativo** — consumo acima do disponível é rejeitado.
2. **Código único** entre produtos ativos e inativos.
3. **Estoque mínimo ≥ 0**; preços ≥ 0 (venda pode ser zero).
4. **Status do produto:**
   - `Zerado` se saldo = 0
   - `Baixo` se 0 < saldo ≤ estoque mínimo
   - `Normal` se saldo > estoque mínimo
5. **Cadastro não gera movimento** — saldo inicial é sempre 0.
6. **Entrada de insumo** só por fatura de compra.
7. **Fabricação** consome insumos e produz acabado atomicamente.
8. **Ajuste** calcula `quantidade = novoSaldo − saldoAtual` (pode ser negativa no histórico).
9. **Senha padrão** `admin123` não pode ser mantida após o primeiro acesso.

---

## 7. Escopo fora da versão atual

- Multi-empresa / multi-depósito
- Código de barras / leitor
- Integração fiscal (NF-e / XML)
- Estorno de fatura ou cancelamento de fabricação
- Sincronização em nuvem / estoque compartilhado entre PCs
- Contagem inventarial guiada com divergências
- Lote, validade e localização de prateleira
- Aprovação de documentos por segundo perfil

---

## 8. Critérios de aceite (resumo)

- [ ] Login obrigatório; senha padrão força troca antes do uso.
- [ ] Cadastro com código duplicado é bloqueado com mensagem clara.
- [ ] Produto novo inicia com saldo 0 (sem estoque “inicial” no cadastro).
- [ ] Fatura aumenta saldo apenas de insumos.
- [ ] Fabricação consome insumos e credita acabado; bloqueia se faltar saldo.
- [ ] Ajuste define saldo absoluto e aparece no histórico.
- [ ] Entrada/saída avulsa pela tela de movimentos é rejeitada pela API.
- [ ] Operador não acessa usuários, backup, marca, seed nem atualizações.
- [ ] Produto inativo não aparece nos seletores de fatura/fabricação/ajuste.
- [ ] Exportação CSV do relatório de posição gera arquivo válido.
- [ ] App inicia sem internet e carrega dados locais.
