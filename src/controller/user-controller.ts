import {Router, Request, Response} from 'express';
import {getCustomRepository} from "typeorm";
import {UserRepository} from "../repository/user-repository";
import {check, validationResult} from "express-validator/check";
import {arrayToObject} from "../util/collection";
import {MailService} from "../service/mail-service";
import {CryptoUtils} from "../util/crypto-utils";
import {secret} from "../server";
import {CookieJar} from "../middleware/cookie-jar";

const mailService = new MailService();
const router: Router = Router();
const create = getCustomRepository;

router.get('/login', (req: Request, res: Response) => {
    res.render('user/login');
});

router.post('/login', async (req: Request, res: Response) => {

    const repo = create(UserRepository);
    const user = await repo.findByUsername(req.body.email);

    if (user === undefined || !(await repo.correctPassword(user, req.body.password))) {
        res.render('user/login', { "error": "Oops, check again please!", "data": { "email": req.body.email }});
        return;
    }

    if (!user.confirmedEmail) {
        res.render('user/login', { "error": "Please confirm your email address first", "data": { "email": req.body.email }});
        return;
    }

    res.cookie("xi" , new CookieJar(user.email!).encryptedJson()).redirect('../game/list');
});

router.get('/register', (req: Request, res: Response) => {
    res.render('user/register');
});

router.post('/register', [
        check('name', 'use at least 2 chars').isLength({ min: 2, max: 30 }),
        check('email', 'that\'s not an email address').isEmail(),
        check('password', 'too easy to guess').isLength({ min: 6 })
    ], async (req: Request, res: Response) => {

    const errorArray = validationResult(req).array();
    const data = { "name": req.body.name, "email": req.body.email };

    if (errorArray.length > 0) {
        res.render('user/register', { "errors": arrayToObject(errorArray, "param"), "data": data });
        return;
    }

    const user = await create(UserRepository).createAndSave(req.body.name, req.body.email, req.body.password);
    const encrypted = CryptoUtils.encrypt(user.email!, secret) as string;
    const confirmationUrl = `<a href="${req.protocol}://${req.get('host')}/user/confirm?code=${encodeURIComponent(encrypted)}">Xi - confirm email</a>`;

    await mailService.send("bkiers+xi@gmail.com", user.email!, "Xi - confirm email address", confirmationUrl);

    res.render('user/register-success');
});

router.get('/confirm', async (req: Request, res: Response) => {

    const decoded = decodeURIComponent(req.query.code);
    const decrypted = CryptoUtils.decrypt(decoded, secret);
    const repo = create(UserRepository);

    if (decrypted === undefined) {
        res.send('No no no...');
        return;
    }

    const user = await repo.findByUsername(decrypted);

    if (user === undefined || user.confirmedEmail) {
        res.send("No no no...");
        return;
    }

    user.confirmedEmail = true;
    await repo.save(user);

    res.render('user/login', { "info": "confirmation successful, please login", "data": { "email": user.email }});
});

router.get('/reset-request', (req: Request, res: Response) => {
    res.render('user/reset-request');
});

router.post('/reset-request', async (req: Request, res: Response) => {

    const repo = create(UserRepository);
    const user = await repo.findByUsername(req.body.email);

    if (user === undefined) {
        res.render('user/reset-pending');
        return;
    }

    const encrypted = CryptoUtils.encrypt(user.email!, secret) as string;
    const resetUrl = `<a href="${req.protocol}://${req.get('host')}/user/reset?code=${encodeURIComponent(encrypted)}">Xi - reset password</a>`;
    await mailService.send("bkiers+xi@gmail.com", user.email!, "Xi - reset password", resetUrl);

    res.render('user/reset-pending');
});

router.get('/reset', (req: Request, res: Response) => {
    res.render('user/reset', { "code": decodeURIComponent(req.query.code) });
});

router.post('/reset', [
        check('password', 'too easy to guess').isLength({ min: 6 })
    ], async (req: Request, res: Response) => {

    const decoded = decodeURIComponent(req.body.code);
    const decrypted = CryptoUtils.decrypt(decoded, secret);
    const newPassword = req.body.password;

    if (decrypted === undefined) {
        res.send('No no no...');
        return;
    }

    const repo = create(UserRepository);
    const user = await repo.findByUsername(decrypted);

    if (user === undefined) {
        res.send('No no no...');
        return;
    }

    user.passwordHash = await repo.hashedPassword(newPassword);
    user.confirmedEmail = true;
    await repo.save(user);

    res.render('user/login', { "data": { "email": user.email }});
});

export const UserController: Router = router;