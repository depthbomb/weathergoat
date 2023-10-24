import Koa from 'koa';

export async function startWebServer() {
	const app = new Koa().use(async ctx => ctx.body = 'works');

	app.listen(3000);
}
