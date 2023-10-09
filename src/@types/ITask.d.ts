export interface ITask {
	immediate?: boolean;
	once?: boolean;
	cron?: string;
	interval?: number | string;
	execute(...args: unknown[]): Promise<unknown> | unknown;
}
