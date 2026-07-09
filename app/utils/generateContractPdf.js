import PDFDocument from 'pdfkit';

export default function generateContractPdf(contract) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50 });
        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const { client, installments = [] } = contract;
        const diarias = Math.ceil(
            (new Date(contract.check_out) - new Date(contract.check_in)) / (1000 * 60 * 60 * 24)
        );

        // Título
        doc.fontSize(18).font('Helvetica-Bold').text('CONTRATO DE LOCAÇÃO DE ESPAÇO', { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(10).font('Helvetica').text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, { align: 'right' });
        doc.moveDown();

        // Partes
        doc.fontSize(12).font('Helvetica-Bold').text('DAS PARTES');
        doc.moveTo(50, doc.y).lineTo(560, doc.y).stroke();
        doc.moveDown(0.3);
        doc.fontSize(10).font('Helvetica');
        doc.font('Helvetica-Bold').text('LOCATÁRIO:');
        doc.font('Helvetica');
        doc.text(`Organização: ${client.razao_social}`);
        if (client.cnpj) doc.text(`CNPJ: ${client.cnpj}`);
        if (client.endereco) doc.text(`Endereço: ${client.endereco}`);
        if (client.representante_nome) {
            doc.moveDown(0.3);
            doc.text(`Representante Legal: ${client.representante_nome}`);
            if (client.representante_cpf) doc.text(`CPF: ${client.representante_cpf}`);
            if (client.representante_rg) doc.text(`RG: ${client.representante_rg}`);
        }
        doc.moveDown();

        // Objeto
        doc.fontSize(12).font('Helvetica-Bold').text('DO OBJETO');
        doc.moveTo(50, doc.y).lineTo(560, doc.y).stroke();
        doc.moveDown(0.3);
        doc.fontSize(10).font('Helvetica').text(contract.objeto);
        doc.moveDown();

        // Período
        doc.fontSize(12).font('Helvetica-Bold').text('DO PERÍODO');
        doc.moveTo(50, doc.y).lineTo(560, doc.y).stroke();
        doc.moveDown(0.3);
        doc.fontSize(10).font('Helvetica');
        doc.text(`Check-in: ${new Date(contract.check_in + 'T12:00:00').toLocaleDateString('pt-BR')} às 14h00`);
        doc.text(`Check-out: ${new Date(contract.check_out + 'T12:00:00').toLocaleDateString('pt-BR')} às 12h00`);
        doc.text(`Total de diárias: ${diarias} | Pessoas: ${contract.pessoas}`);
        doc.moveDown();

        // Pagamento
        doc.fontSize(12).font('Helvetica-Bold').text('DO PAGAMENTO');
        doc.moveTo(50, doc.y).lineTo(560, doc.y).stroke();
        doc.moveDown(0.3);
        doc.fontSize(10).font('Helvetica');
        doc.font('Helvetica-Bold').text(`Valor total: R$ ${Number(contract.total).toFixed(2)}`);
        doc.font('Helvetica').moveDown(0.3);

        if (installments.length > 0) {
            doc.text('Cronograma de pagamento:');
            installments.forEach((inst, i) => {
                doc.text(`  ${i + 1}. ${inst.descricao} — R$ ${Number(inst.valor).toFixed(2)} — Vencimento: ${new Date(inst.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}`);
            });
        }
        doc.moveDown();

        // Cláusulas
        doc.fontSize(12).font('Helvetica-Bold').text('CLÁUSULAS GERAIS');
        doc.moveTo(50, doc.y).lineTo(560, doc.y).stroke();
        doc.moveDown(0.3);
        doc.fontSize(9).font('Helvetica');
        doc.text('1. O não pagamento de qualquer parcela no vencimento implicará multa de 2% sobre o valor da parcela em atraso, acrescida de juros de 1% ao mês.');
        doc.moveDown(0.3);
        doc.text('2. O cancelamento com menos de 30 dias de antecedência implica retenção de 30% do valor total contratado.');
        doc.moveDown(0.3);
        doc.text('3. Danos ao patrimônio do estabelecimento serão de inteira responsabilidade do LOCATÁRIO e cobrados separadamente.');
        doc.moveDown(0.3);
        doc.text('4. O presente contrato é firmado em caráter irrevogável e irretratável, obrigando as partes e seus sucessores.');
        doc.moveDown(2);

        // Assinaturas
        doc.fontSize(10).font('Helvetica');
        const sigY = doc.y;
        doc.text('______________________________', 50, sigY);
        doc.text('LOCADOR', 50, sigY + 15);
        doc.text('______________________________', 320, sigY);
        doc.text(`LOCATÁRIO — ${client.representante_nome || client.razao_social}`, 320, sigY + 15);
        doc.moveDown(3);

        const witnessY = doc.y;
        doc.text('______________________________', 50, witnessY);
        doc.text(`Testemunha 1: ${contract.testemunha_1}`, 50, witnessY + 15);
        doc.text('______________________________', 320, witnessY);
        doc.text(`Testemunha 2: ${contract.testemunha_2}`, 320, witnessY + 15);

        doc.end();
    });
}
