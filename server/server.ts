import express from 'express';
import next from 'next';
import { calculateForNormalizedData } from './calculate';
import { fetchNormalizedGDQTrackerData, fetchNormalizedHoraroData, fetchNormalizedOengusData, NormalizedEventData, NormalizedRunnerData } from './normalizers';

const port = parseInt(process.env.PORT ?? '3000', 10);
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();


app.prepare().then(async () => {
  try {
    const server = express();

    server.get('/calculate/oengus/:slug', async (req, res) => {
      const slug = req.params.slug as string;
      
      if (slug) {
        try {
          const data = await fetchNormalizedOengusData(slug);

          res.json(await calculateForNormalizedData(data));
        } catch (e) {
          res.status(400).json({ error: (e as Error).message });
        }
      } else {
        res.status(400).json({ error: 'Marathon slug is required.' });
      }
    });

    server.get('/calculate/horaro/:path', async (req, res) => {
      const [organization, event] = (req.params.path as string).split('/');
      
      if (organization && event) {
        try {
          const data = await fetchNormalizedHoraroData(organization, event);

          res.json(await calculateForNormalizedData(data));
        } catch (e) {
          res.status(400).json({ error: (e as Error).message });
        }
      } else {
        res.status(400).json({ error: 'Organization and event are required.' });
      }
    });

    server.get('/calculate/gdq-tracker/:path', async (req, res) => {
      const path = req.params.path as string;
      
      if (path) {
        try {
          const data = await fetchNormalizedGDQTrackerData(path);

          res.json(await calculateForNormalizedData(data));
        } catch (e) {
          res.status(400).json({ error: (e as Error).message });
        }
      } else {
        res.status(400).json({ error: 'Tracker event path is required.' });
      }
    });
    
    server.get('*', (req, res) => handle(req, res));

    server.listen(3000, (): void => {
      console.info(`> Server listening on port ${port} (dev: ${dev})`);
    });
  } catch (e) {
    console.error('Unable to start server, exiting...');
    console.error(e);
    process.exit();
  }
});
