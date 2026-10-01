import uploadToMinIO from './uploadToMinIO.js';

/**
 * Chave do PDF de um documento B2B no MinIO: `<tenant>/<tipo>/<id>.pdf`. Uma função só para
 * quem grava e quem gera a URL assinada — a chave divergir entre os dois quebraria o download.
 */
export function documentPdfKey(tenantId, kind, id) {
    return `${tenantId}/${kind}/${id}.pdf`;
}

/**
 * Gera o PDF, envia ao MinIO e grava `pdf_url` no registro — em best-effort, FORA da
 * transação do dado: indisponibilidade do MinIO não pode impedir criar ou editar contrato e
 * orçamento (travaria a operação do hotel). RNF-023.
 *
 * Se falhar, `pdf_url` fica nulo — inclusive quando havia um PDF anterior: depois de uma
 * edição, o arquivo antigo não corresponde mais aos dados, e o download passa a gerar sob
 * demanda até o próximo envio dar certo.
 *
 * @param {import('sequelize').Model} record  — instância com a coluna `pdf_url`
 * @param {string} key                         — ver documentPdfKey()
 * @param {() => Promise<Buffer>} generatePdf  — chamado só aqui dentro, para a falha na geração também ser best-effort
 * @param {string} label                       — prefixo do log
 * @returns {Promise<string|null>} a URL gravada, ou null
 */
export default async function storeDocumentPdf(record, key, generatePdf, label) {
    try {
        const pdfUrl = await uploadToMinIO(await generatePdf(), key);
        await record.update({ pdf_url: pdfUrl });
        return pdfUrl;
    } catch (error) {
        console.warn(`${label}: dado salvo, mas PDF/MinIO falhou — pdf_url fica nulo:`, error.message);
        if (record.pdf_url) await record.update({ pdf_url: null });
        return null;
    }
}
