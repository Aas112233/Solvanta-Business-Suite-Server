import { Router } from 'express';
import { AuthController } from './auth.controller.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/auth.js';
import { loginSchema, refreshSchema } from './auth.schema.js';

export const authRoutes = Router();

authRoutes.post('/login', validate({ body: loginSchema }), AuthController.login);
authRoutes.post('/refresh', validate({ body: refreshSchema }), AuthController.refresh);
authRoutes.post('/logout', authenticate, AuthController.logout);
authRoutes.post('/impersonation/stop', authenticate, AuthController.stopImpersonation);
authRoutes.get('/impersonation/session', authenticate, AuthController.getCurrentImpersonationTranscript);
authRoutes.post('/impersonation/session/notes', authenticate, AuthController.addCurrentImpersonationNote);
authRoutes.get('/me', authenticate, AuthController.me);
