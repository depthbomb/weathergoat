import { STORE_DIR } from '@constants';
import { createStorage } from 'unstorage';
import fsDriver from 'unstorage/drivers/fs';

export const storage = createStorage({ driver: fsDriver({ base: STORE_DIR }) });
