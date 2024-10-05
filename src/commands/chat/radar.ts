import { _ } from '@i18n';
import { Color } from '@constants';
import { generateSnowflake } from '@snowflake';
import { BaseCommandWithAutocomplete } from '@commands';
import { Collection, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js';

export default class RadarCommand extends BaseCommandWithAutocomplete {
	private readonly _radars: Collection<string, string>;

	public constructor() {
		super({
			data: new SlashCommandBuilder()
			.setName('radar')
			.setDescription('View an animated weather radar loop of a region of the US')
			.addStringOption(o => o
				.setName('station')
				.setDescription('Station location, some stations may cover multiple areas')
				.setAutocomplete(true)
				.setRequired(true)
			)
		});

		this._radars = new Collection([
			// Stations
			['Aberdeen, South Dakota', 'KABR'],
			['Albuquerque, New Mexico', 'KABX'],
			['Wakefield, Virginia', 'KAKQ'],
			['Amarillo, Texas', 'KAMA'],
			['Miami, Florida', 'KAMX'],
			['Gaylord/Alpena, Michigan', 'KAPX'],
			['La Crosse, Wisconsin', 'KARX'],
			['Seattle/Tacoma, Washington', 'KATX'],
			['Sacramento, California', 'KBBX'],
			['Binghamton, New York', 'KBGM'],
			['Eureka, California', 'KBHX'],
			['Bismarck, North Dakota', 'KBIS'],
			['Billings, Montana', 'KBLX'],
			['Birmingham, Alabama', 'KBMX'],
			['Taunton, Massachusetts', 'KBRO'],
			['Brownsville, Texas', 'KBOX'],
			['Buffalo, New York', 'KBUF'],
			['Boca Chica Key/Key West, Florida', 'KBYX'],
			['West Columbia, South Carolina', 'KCAE'],
			['Houlton/Caribou, Maine', 'KCBW'],
			['Boise, Idaho', 'KCBX'],
			['State College/Central, Pennsylvania', 'KCCX'],
			['Cleveland, Ohio', 'KCLE'],
			['Charleston, South Carolina', 'KCLX'],
			['Corpus Christi, Texas', 'KCRP'],
			['Colchester/Burlington, Vermont', 'KCXX'],
			['Cheyenne, Wyoming', 'KCYS'],
			['Davis/Sacramento, California', 'KDAX'],
			['Dodge City, Kansas', 'KDDC'],
			['Brandon/Jackson, Mississippi', 'KDGX'],
			['Laughlin AFB/San Antonio, Texas', 'KDFX'],
			['Fort Dix/Mt. Holly, New Jersey', 'KDIX'],
			['Philadelphia', 'KDIX'],
			['Duluth, Minnesota', 'KDLH'],
			['Des Moines, Iowa', 'KDMX'],
			['Dover AFB, Delaware & Wakefield, Virginia', 'KDOX'],
			['White Lake/Detroit, MI', 'KDTX'],
			['Dyess AFB/San Angelo, Texas', 'KDYX'],
			['Davenport/Quad Cities, Iowa', 'KDVN'],
			['Kansas City/Pleasant Hill, Missouri', 'KEAX'],
			['Tucson, Arizona', 'KEMX'],
			['East Berne/Albany, New York', 'KENX'],
			['Santa Teresa, New Mexico', 'KEPZ'],
			['El Paso, Texas', 'KEPZ'],
			['Fort Rucker, Alabama & Tallahassee, Florida', 'KEOX'],
			['Las Vegas, Nevada', 'KESX'],
			['New Braunfels/Austin/San Antonio, Texas', 'KEWX'],
			['Eglin AFB, Florida & Mobile, Alabama', 'KEVX'],
			['Edwards AFB, California', 'KEYX'],
			['Las Vegas, Nevada', 'KEYX'],
			['Roanoke/Blacksburg/Roanoke, Virginia', 'KFCX'],
			['Norman, Oklahoma', 'KFDR'],
			['Albuquerque, New Mexico', 'KFDX'],
			['Peachtree City/Atlanta, Georgia', 'KFFC'],
			['Sioux Falls, South Dakota', 'KFSD'],
			['Flagstaff, Arizona', 'KFSX'],
			['Denver/Boulder, Colorado', 'KFTG'],
			['Fort Worth/Dallas, Texas', 'KFWS'],
			['Glasgow, Montana', 'KGGW'],
			['Grand Junction, Colorado', 'KGJX'],
			['Goodland, Kansas', 'KGLD'],
			['Green Bay, Wisconsin', 'KGRB'],
			['Fort Hood/Dallas/Fort Worth, Texas', 'KGRK'],
			['Grand Rapids, Michigan', 'KGRR'],
			['Greer/Greenville/Spartanburg, South Carolina', 'KGSP'],
			['Jackson, Mississippi', 'KGWX'],
			['Gray/Portland, Maine', 'KGYX'],
			['Holloman AFB, New Mexico & El Paso, Texas', 'KHDX'],
			['Houston/Galveston, Texas', 'KHGX'],
			['Hanford/San Joaquin Valley, California', 'KHNX'],
			['Fort Campbell/Paducah, Kentucky', 'KHPX'],
			['Hytop/Huntsville, Alabama', 'KHTX'],
			['Wichita, Kansas', 'KICT'],
			['Wilmington/Cincinnati, Ohio', 'KILN'],
			['Cedar City/Salt Lake City, Utah', 'KICX'],
			['Lincoln, Illinois & Central Illinois', 'KILX'],
			['Indianapolis, Indiana', 'KIND'],
			['Inola/Tulsa, Oklahoma', 'KINX'],
			['Phoenix, Arizona', 'KIWA'],
			['North Webster, Indiana & Northern Indiana', 'KIWX'],
			['Jacksonville, Florida', 'KJAX'],
			['Robins AFB/Atlanta, Georgia', 'KJGX'],
			['Jackson, Kentucky', 'KJKL'],
			['Lubbock, Texas', 'KLBB'],
			['Lake Charles, Louisiana', 'KLCH'],
			['Langley Hill/Seattle/Tacoma, WA', 'KLGX'],
			['Slidell/New Orleans/Baton Rouge, Lousiana', 'KLIX'],
			['North Platte, Nebraska', 'KLNX'],
			['Elko, Nevada', 'KLRX'],
			['Romeoville/Chicago, Illinois', 'KLOT'],
			['Weldon Springs/St. Louis, Missouri', 'KLSX'],
			['Shallotte/Wilmington, North Carolina', 'KLTX'],
			['Fort Knox/Louisville, Kentucky', 'KLVX'],
			['Sterling, Virginia & Baltimore, Maryland & Washington D.C.', 'KLWX'],
			['North Little Rock/Little Rock, Arkansas', 'KLZK'],
			['Midland/Odessa, Texas', 'KMAF'],
			['Medford, Oregon', 'KMAX'],
			['Minot AFB/Bismarck, North Dakota', 'KMBX'],
			['Melbourne, Florida', 'KMLB'],
			['Newport/Morehead City, North Carolina', 'KMHX'],
			['Dousman/Milwaukee, Wisconsin', 'KMKX'],
			['Mobile, Alabama', 'KMOB'],
			['Chanhassen/Minneapolis, Minnesota', 'KMPX'],
			['Negaunee/Marquette, Michigan', 'KMQT'],
			['Morristown/Knoxville/Tri-cities, Tennessee', 'KMRX'],
			['Missoula, Montana', 'KMSX'],
			['Salt Lake City, Utah', 'KMTX'],
			['San Francisco Bay Area, California', 'KMUX'],
			['Grand Forks/Fargo, North Dakota', 'KMVX'],
			['Maxwell AFB/Birmingham, AL', 'KMXX'],
			['San Diego, California', 'KNKX'],
			['Millington/Memphis, Tennessee', 'KNQA'],
			['Valley/Omaha, Nebraska', 'KOAX'],
			['Old Hickory/Nashville, Tennessee', 'KOHX'],
			['Upton/New York City, New York', 'KOKX'],
			['Spokane, Washington', 'KOTX'],
			['Paducah, Kentucky', 'KPAH'],
			['Pittsburgh, Pennsylvania', 'KPBZ'],
			['Pendleton, Oregon', 'KPDT'],
			['Fort Polk/Lake Charles, Lousiana', 'KPOE'],
			['Pueblo, Colorado', 'KPUX'],
			['Clayton/Raleigh/Durham, North Carolina', 'KRAX'],
			['Nixon/Reno, Nevada', 'KRGX'],
			['Riverton, Wyoming', 'KRIW'],
			['Charleston, West Virginia', 'KRLX'],
			['Portland, Oregon', 'KRTX'],
			['Springfield/Pocatello, Idaho', 'KSFX'],
			['Springfield, Missouri', 'KSGF'],
			['Shreveport, Lousiana', 'KSHV'],
			['San Angelo, Texas', 'KSJT'],
			['Santa Ana Mountains/San Diego, California', 'KSOX'],
			['Chaffee Ridge, Arkansas & Tulsa, Oklahoma', 'KSRX'],
			['Ruskin/Tampa Bay Area, Florida', 'KTBW'],
			['Great Falls, Montana', 'KTFX'],
			['Tallahassee, Florida', 'KTLH'],
			['Oklahoma City/Norman, Oklahoma', 'KTLX'],
			['Topeka, Kansas', 'KTWX'],
			['Montague/Burlington, New York', 'KTYX'],
			['New Underwood/Rapid City, South Dakota', 'KUDX'],
			['Blue Hill/Hastings, Nebraska', 'KUEX'],
			['Moody AFB, Georgia & Tallahassee, Florida', 'KVAX'],
			['Vandenberg AFB & Los Angeles/Oxnard, California', 'KVBX'],
			['Vance AFB/Oklahoma City, Oklahoma', 'KVNX'],
			['Los Angeles/Oxnard, California', 'KVTX'],
			['Owensville, Indiana & Paducah, Kentucky', 'KVWX'],
			['Yuma/Phoenix, Arizona', 'KYUX'],
			['San Juan, Puerto Rico', 'TJUA'],
			['Bethel/Anchorage, Alaska', 'PABC'],
			['Fairbanks, Alaska', 'PAPD'],
			['Honolulu, Hawai\'i', 'PHKM'],
			['Kenai/Anchorage, Alaska', 'PAHG'],
			['King Salmon/Anchorage, Alaska', 'PAKC'],
			['Middleton Island/Anchorage, Alaska', 'PAIH'],
			['Molokai/Honolulu, Hawai\'i', 'PHMO'],
			['Home/Fairbanks, Alaska', 'PAEC'],
			['Sitka/Juneau, Alaska', 'PACG'],
			['South Kauai/Honolulu, Hawai\'i', 'PHKI'],
			['South Shore/Honolulu, Hawai\'i', 'PHWA'],
			['Agana/Tiyan, Guam', 'PGUA'],
			// Regions
			['Pacific Northwest', 'PACNORTHWEST'],
			['North Rockies', 'NORTHROCKIES'],
			['Upper Mississippi Valley', 'UPPERMISSVLY'],
			['Central Great Lakes', 'CENTGRLAKES'],
			['Northeast', 'NORTHEAST'],
			['Pacific Southwest', 'PACSOUTHWEST'],
			['Southern Rockies', 'SOUTHROCKIES'],
			['Southern Plains', 'SOUTHPLAINS'],
			['Southern Mississippi Valley', 'SOUTHMISSVLY'],
			['National', 'CONUS-LARGE'],
			['Alaska', 'ALASKA'],
			['Hawai\'i', 'HAWAII'],
			['Guam', 'GUAM'],
			['Puerto Rico', 'TJUA'],
		]);
	}

	public handle(interaction: ChatInputCommandInteraction): Promise<unknown> {
		const station = interaction.options.getString('station', true);
		if (!this._radars.find(v => v === station)) {
			return interaction.reply(_('commands.radar.err.invalidStation', { station }));
		}

		const embed = new EmbedBuilder()
			.setColor(Color.Primary)
			.setImage(`https://radar.weather.gov/ridge/standard/${station}_loop.gif?${generateSnowflake()}`)
			.setTitle(_('commands.radar.embedTitle', { station }))
			.setURL(`https://radar.weather.gov/station/${station.toLowerCase()}/standard`);

		return interaction.reply({ embeds: [embed] });
	}

	public async handleAutocomplete(interaction: AutocompleteInteraction): Promise<unknown> {
		const value = interaction.options.getFocused().trim().toLowerCase();

		if (value.length === 0) return;

		const filtered = this._radars.filter((v, k) => k.toLowerCase().includes(value) || v.toLowerCase().includes(value));
		const limited  = [...filtered.entries()].slice(0, 25); // Limit the results to 25

		return interaction.respond(limited.map(([name, value]) => ({ name, value })));
	}
}

