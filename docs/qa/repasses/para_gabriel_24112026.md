# Repasses para o Gabriel — 24/11/2026

Origem: QA explorador do roteiro da demonstração (`docs/qa/exploratorio_roteiro-demonstracao_24112026.md`), na `develop` `bf9cafe`. Evidências em `docs/qa/evidencias/roteiro-demonstracao_24112026/`, pasta fora do git.

> **Atualização de 24/11 (Sirlande):** todos os itens deste repasse foram corrigidos na branch `fix/qa-roteiro-24nov`, com o aceite do Sirlande para mexer nas telas. O Gabriel revisa no PR. O que mudou em cada um está na seção "Correções de 24/11" do relatório.

## 🟡 A conta e o comprovante mostram o total da linha sem a quantidade
- **Onde:** `/reservas/:id?aba=conta` (`BillTimeline`) e `/reservas/:id/comprovante`.
- **O que acontece:** 3 caipirinhas de R$ 22,00 aparecem como "Caipirinha R$ 66,00". Duas porções lançadas em momentos diferentes aparecem como "Porção de fritas R$ 32,00" e "Porção de fritas R$ 64,00".
- **Causa:** o `GET /reservations/:id/bill` não devolve `quantity` (repasse ao Sirlande, dona do `GetBillController`).
- **Sugestão:** mostrar "3 × Caipirinha" quando `quantity > 1`, assim que o campo existir.
- **Evidência:** `p5_comprovante_902_800.png`.

## 🟡 A linha do tempo da conta esconde o dinheiro em larguras estreitas
- **800 px:** tabela de 520 px num contêiner de 514 px. O saldo aparece cortado ("R$ 150,5").
- **360 px:** "Valor" e "Saldo" ficam fora da tela.
- **Regra:** `DESIGN_PMS.md` §5, duas casas sempre visíveis.
- **Evidência:** `p5_902_pago_em_dobro_800.png` e `p5_conta_201_360.png`.

## 🟡 API pública: data que não existe no calendário → 500
- **Onde:** `GET /public/aurora/availability?check_in=2026-02-30&check_out=2026-03-02` e `POST /public/aurora/bookings` com as mesmas datas.
- **Obtido:** `{"error":"Erro interno do servidor"}` com 500.
- **Sugestão:** usar o `isIsoDate` da SPEC-11 nos dois controllers e responder 400.

## 🟡 API pública grava hóspede com CPF de dígito errado no plano B
- **Passos:** `POST /public/aurora/bookings` com `guest.cpf: "111.111.111-11"` e `PIX_PROVIDER=fake`.
- **Obtido:** 201, e o hóspede entra com o CPF `11111111111`.
- **Causa:** a checagem só roda com `pix.requiresPayerCpf` (`CreateBookingController.js:104-107`).
- **Sugestão:** validar sempre que o CPF vier preenchido. O CPF continua opcional.

## 🟢 Melhorias
- **Categoria com o mesmo nome em outra caixa é aceita** ("QA Suíte Teste" e "qa suíte teste"). Sugestão: unicidade por `lower(trim(name))` no `CreateRoomCategoryController`.
- **CPF repetido na nova reserva sem atalho "Usar este hóspede".** Hoje são 3 a 4 ações a mais no balcão (`GuestPicker`).
- **Liberar quarto sem rede:** o botão fica em "Liberando…", com o "Voltar" travado, sem dizer "Sem conexão…". Envia quando a rede volta (`p4_liberar-offline_1_confirmou_sem_rede_1280.aria.yml`).
- **Entrada no passado na nova reserva só é recusada ao confirmar.** Convém avisar junto ao campo "Entrada".
- **Painel Hoje com 502:** o bloco "Saídas" diz "Não foi possível carregar os hóspedes na casa".
- **Guia da demonstração, passo 7:** a fala "Se o analytics cair, a recepção continua funcionando" e a linha "os outros passos não dependem dele" não valem para o painel Hoje. Com o analytics em 502, ele perde os cartões, a lista "Atenção" e o bloco "Em limpeza" (`p4_502-analytics_1_1280.aria.yml`). Sugestão de fala: "a operação do balcão continua; o painel do dia perde os números". A falta dos cartões já está na SPEC-11 para o 5º semestre.
