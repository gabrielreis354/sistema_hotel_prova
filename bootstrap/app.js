import dotenv from "dotenv";
import initRelations from "../database/relations.js";

export default function app() {
    // Inicializar variáveis de ambiente (.env)
    dotenv.config({
        quiet: true,
        path: process.cwd() + "/.env"
    });

    // Inicializar os relacionamentos entre os Models do Sequelize
    initRelations();
}
