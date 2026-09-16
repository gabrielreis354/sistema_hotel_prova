import PDFDocument from 'pdfkit';

export default function generateQuotePdf(quote) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50 });
        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const { client, services = [] } = quote;
        const diarias = Math.ceil(
            (new Date(quote.check_out) - new Date(quote.check_in)) / (1000 * 60 * 60 * 24)
        );
        const valorDiaria = quote.inclui_refeicao
            ? Number(quote.valor_diaria_com_refeicao)
            : Number(quote.valor_diaria_sem_refeicao);

        // Cabeçalho
        doc.fontSize(20).font('Helvetica-Bold').text('PROPOSTA DE HOSPEDAGEM', { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(10).font('Helvetica').text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, { align: 'right' });
        doc.moveDown();

        // Dados do cliente
        doc.fontSize(13).font('Helvetica-Bold').text('DADOS DO SOLICITANTE');
        doc.moveTo(50, doc.y).lineTo(560, doc.y).stroke();
        doc.moveDown(0.3);
        doc.fontSize(10).font('Helvetica');
        doc.text(`Organização: ${client.razao_social}`);
        if (client.cnpj) doc.text(`CNPJ: ${client.cnpj}`);
        if (client.email) doc.text(`E-mail: ${client.email}`);
        if (client.telefone) doc.text(`Telefone: ${client.telefone}`);
        doc.moveDown();

        // Período e grupo
        doc.fontSize(13).font('Helvetica-Bold').text('DETALHES DA HOSPEDAGEM');
        doc.moveTo(50, doc.y).lineTo(560, doc.y).stroke();
        doc.moveDown(0.3);
        doc.fontSize(10).font('Helvetica');
        doc.text(`Check-in: ${new Date(quote.check_in + 'T12:00:00').toLocaleDateString('pt-BR')}`);
        doc.text(`Check-out: ${new Date(quote.check_out + 'T12:00:00').toLocaleDateString('pt-BR')}`);
        doc.text(`Diárias: ${diarias}`);
        doc.text(`Pessoas: ${quote.pessoas}`);
        doc.text(`Inclui refeição: ${quote.inclui_refeicao ? 'Sim' : 'Não'}`);
        doc.text(`Inclui roupa de cama: ${quote.inclui_roupa_cama ? 'Sim' : 'Não'}`);
        doc.moveDown();

        // Tabela financeira
        doc.fontSize(13).font('Helvetica-Bold').text('RESUMO FINANCEIRO');
        doc.moveTo(50, doc.y).lineTo(560, doc.y).stroke();
        doc.moveDown(0.3);
        doc.fontSize(10).font('Helvetica');

        const subtotalHospedagem = valorDiaria * quote.pessoas * diarias;
        doc.text(`Valor por diária (${quote.inclui_refeicao ? 'com refeição' : 'sem refeição'}): R$ ${valorDiaria.toFixed(2)}`);
        doc.text(`Subtotal hospedagem (${quote.pessoas} pax × ${diarias} diárias): R$ ${subtotalHospedagem.toFixed(2)}`);

        let subtotalServicos = 0;
        if (services.length > 0) {
            doc.moveDown(0.3);
            doc.font('Helvetica-Bold').text('Serviços adicionais:');
            doc.font('Helvetica');
            services.forEach(s => {
                const t = Number(s.total);
                subtotalServicos += t;
                doc.text(`  • ${s.nome} (${s.quantidade}x R$ ${Number(s.valor_unitario).toFixed(2)} × ${s.diarias} dias): R$ ${t.toFixed(2)}`);
            });
        }

        const desconto = Number(quote.desconto_pct) || 0;
        const subtotal = subtotalHospedagem + subtotalServicos;
        const valorDesconto = subtotal * (desconto / 100);

        doc.moveDown(0.5);
        doc.text(`Subtotal: R$ ${subtotal.toFixed(2)}`);
        if (desconto > 0) doc.text(`Desconto (${desconto}%): -R$ ${valorDesconto.toFixed(2)}`);
        doc.font('Helvetica-Bold').fontSize(12).text(`TOTAL: R$ ${Number(quote.total).toFixed(2)}`);

        if (quote.observacoes) {
            doc.moveDown();
            doc.fontSize(10).font('Helvetica-Bold').text('Observações:');
            doc.font('Helvetica').text(quote.observacoes);
        }

        // Rodapé
        doc.moveDown(2);
        doc.fontSize(9).fillColor('grey').text('Esta proposta tem validade de 15 dias a partir da data de emissão.', { align: 'center' });

        doc.end();
    });
}
