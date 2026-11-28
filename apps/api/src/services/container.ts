import type { AppConfig } from '../config/env.js';
import type { Db } from '../db.js';
import { createAuthClient, type AuthClient } from '../lib/authClient.js';
import { createDocumentStore, type DocumentStore } from '../lib/documentStore.js';
import { createMailer, type Mailer } from '../lib/email.js';
import type { Logger } from '../lib/logger.js';
import { createMediaStore, type MediaStore } from '../lib/media.js';
import { createPaypal, type Paypal } from '../lib/paypal.js';
import { createVideoStore, type VideoStore } from '../lib/video.js';
import { createCatalogue, type Catalogue } from './catalogue.js';
import { createDocuments, type Documents } from './documents.js';
import { createNotifications } from './notifications.js';
import { createOrders, type Orders } from './orders.js';

/** Everything the routes need, built once at startup. Tests swap parts out. */
export interface Services {
  config: AppConfig;
  db: Db;
  logger: Logger;
  media: MediaStore;
  video: VideoStore;
  mailer: Mailer;
  paypal: Paypal;
  auth: AuthClient;
  catalogue: Catalogue;
  orders: Orders;
  documentStore: DocumentStore;
  documents: Documents;
}

export function createServices(
  base: { config: AppConfig; db: Db; logger: Logger },
  overrides: Partial<
    Pick<Services, 'media' | 'video' | 'mailer' | 'paypal' | 'auth' | 'documentStore'>
  > = {},
): Services {
  const { config, db, logger } = base;
  const media = overrides.media ?? createMediaStore(config);
  const video = overrides.video ?? createVideoStore(config);
  const mailer = overrides.mailer ?? createMailer(config, logger);
  const paypal = overrides.paypal ?? createPaypal(config);
  const auth = overrides.auth ?? createAuthClient(config);
  const documentStore = overrides.documentStore ?? createDocumentStore(config);
  const notifications = createNotifications({ config, mailer, logger });
  return {
    ...base,
    media,
    video,
    mailer,
    paypal,
    auth,
    catalogue: createCatalogue(db, media, video),
    orders: createOrders({ db, config, media, logger, paypal, notifications }),
    documentStore,
    documents: createDocuments({ db, store: documentStore, mailer, logger }),
  };
}
