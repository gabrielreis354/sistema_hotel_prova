import initRelations from "../database/relations.js";

export default function app() {
    // Inicializar os relacionamentos entre os Models do Sequelize
    // (dotenv já foi carregado em _web.js antes deste módulo ser importado)
    initRelations();
}
