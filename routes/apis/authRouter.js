import { Router } from 'express';
import LoginController    from '../../app/Controllers/AuthApi/LoginController.js';
import RegisterController from '../../app/Controllers/AuthApi/RegisterController.js';

export default (() => {
    const router = Router();

    router.post('/login',    LoginController);
    router.post('/register', RegisterController);

    return router;
})();
