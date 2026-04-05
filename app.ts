import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
dotenv.config();

import routes from './app/routes/routes';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(helmet());

app.get('/health', (_req, res) => {
    res.send('HomeZ app is running!');
});

app.use('/api', routes);

app.get('/', (_req, res) => {
    res.status(404).send('Not Found');
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

app.listen(PORT, () => {
    console.log(`Server is running on at http://localhost:${PORT}`);
});