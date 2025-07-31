import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionType,
	NodeOperationError
} from "n8n-workflow";
import {Readability} from '@mozilla/readability';
import * as cheerio from 'cheerio';
import {JSDOM} from 'jsdom';

export interface ICleanOptions {
	removeComments: boolean
	removeEmptyTags: boolean
	removeScripts: boolean
	removeStyles: boolean
	removeAttributes: boolean
	excludedAttributes: string
	excludedSelectors: string
	excludedTags: string
}

export interface ICleanerOutput {
	html: string | null | undefined;
	title: string | null | undefined;
	lang: string | null | undefined;
	content: string | null | undefined;
	textContent: string | null | undefined;
	length: number | null | undefined;
	excerpt: string | null | undefined;
	markdown?: string | null | undefined;
}

export interface ReadabilityArticle {
	/** article title */
	title: string | null | undefined;

	/** HTML string of processed article content */
	content: string | null | undefined;

	/** text content of the article, with all the HTML tags removed */
	textContent: string | null | undefined;

	/** length of an article, in characters */
	length: number | null | undefined;

	/** article description, or short excerpt from the content */
	excerpt: string | null | undefined;

	/** author metadata */
	byline: string | null | undefined;

	/** content direction */
	dir: string | null | undefined;

	/** name of the site */
	siteName: string | null | undefined;

	/** content language */
	lang: string | null | undefined;

	/** published time */
	publishedTime: string | null | undefined;
}

export class HtmlCleaner implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'HTML Cleaner',
		name: 'htmlCleaner',
		icon: 'file:icon.svg',
		group: ['transform'],
		version: 1,
		description: 'Cleans HTML content',
		defaults: {
			name: 'HTML Cleaner',
		},
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		properties: [
			{
				displayName: 'HTML Content',
				name: 'htmlContent',
				type: 'string',
				default: '',
				placeholder: '<p>Enter HTML content here</p>',
				description: 'The HTML content to clean',
			},
			{
				displayName: 'Clean Options',
				name: 'cleanOptions',
				default: {},
				type: 'collection',
				options: [
					{
						displayName: 'Excluded Attributes',
						name: 'excludedAttributes',
						type: 'string',
						default: '',
						placeholder: 'onclick, onerror',
						description: 'Comma-separated list of HTML attributes to exclude from cleaning. These attributes will be removed from the HTML tags.',
					},
					{
						displayName: 'Excluded Selectors',
						name: 'excludedSelectors',
						type: 'string',
						default: '',
						placeholder: '.no-clean, #ignore',
						description: 'Comma-separated list of CSS selectors to exclude from cleaning. These selectors will be removed from the HTML content.',
					},
					{
						displayName: 'Excluded Tags',
						name: 'excludedTags',
						type: 'string',
						default: '',
						placeholder: 'script, style, iframe, nav, footer, aside, link, head, noscript, ul, svg, figure',
						description: 'Comma-separated list of HTML tags to exclude from cleaning. These tags will be removed from the HTML content.',
					},
					{
						displayName: 'Remove Attributes',
						name: 'removeAttributes',
						type: 'boolean',
						default: true,
						description: 'Whether to remove all attributes from HTML tags',
					},
					{
						displayName: 'Remove Comments',
						name: 'removeComments',
						type: 'boolean',
						default: true,
						description: 'Whether to remove HTML comments',
					},
					{
						displayName: 'Remove Empty Tags',
						name: 'removeEmptyTags',
						type: 'boolean',
						default: true,
						description: 'Whether to remove empty HTML tags',
					},
					{
						displayName: 'Remove Scripts',
						name: 'removeScripts',
						type: 'boolean',
						default: true,
						description: 'Whether to remove script tags and their content',
					},
					{
						displayName: 'Remove Styles',
						name: 'removeStyles',
						type: 'boolean',
						default: true,
						description: 'Whether to remove style tags and their content',
					},
				],
			},
			{
				displayName: 'Readability Options',
				name: 'readabilityOptions',
				type: 'collection',
				placeholder: 'Add Option',
				description: "Options for @mozilla/readability parsing",
				default: {},
				options: [
					{
						displayName: "Char Threshold",
						name: 'charThreshold',
						type: 'number',
						default: 500,
						description: 'The number of characters an article must have in order to return a result',
					},
					{
						displayName: "Classes To Preserve",
						name: 'classesToPreserve',
						type: 'string',
						default: '',
						placeholder: 'class1, class2',
						description: 'A comma-separated list of classes to preserve on HTML elements when the keepClasses options is set to false',
					},
					{
						displayName: "Disable JSON-LD",
						name: 'disableJSONLD',
						type: 'boolean',
						default: false,
						description: 'Whether to disable JSON-LD extraction. when extracting page metadata, Readability gives precedence to Schema.org fields specified in the JSON-LD format. Set this option to true to skip JSON-LD parsing.',
					},
					{
						displayName: "Keep Classes",
						name: 'keepClasses',
						type: 'boolean',
						default: false,
						description: 'Whether to preserve all classes on HTML elements. When set to false only classes specified in the classesToPreserve array are kept.',
					},
					{
						displayName: "NB Top Candidates",
						name: 'nbTopCandidates',
						type: 'number',
						default: 5,
						description: 'The number of top candidates to consider when analysing how tight the competition is among candidates',
					},
				]
			},
			{
				displayName: 'Markdown Output',
				name: 'markdownOutput',
				type: 'boolean',
				default: false,
				description: 'Whether to output the cleaned HTML as Markdown. If set to true, the output will be converted to Markdown format using the `turndown` library.',
			}
		],
	}


	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();

		const output: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {

			const htmlContent = this.getNodeParameter('htmlContent', itemIndex, '') as string;
			if (!htmlContent) {
				if (this.continueOnFail()) {
					output.push({
						json: {
							error: `HTML content is required for item ${itemIndex + 1}`,
							message: `HTML content is required for item ${itemIndex + 1}`,
						},
						pairedItem: {
							item: itemIndex,
						},
					});
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`HTML content is required for item ${itemIndex + 1}`,
						{itemIndex: itemIndex},
					);
				}
			}

			const cleanOptions: ICleanOptions = this.getNodeParameter('cleanOptions', itemIndex, {}) as ICleanOptions;

			// If no clean options are provided, set default values
			if (Object.keys(cleanOptions).length === 0) {
				cleanOptions.removeComments = false;
				cleanOptions.removeEmptyTags = false;
				cleanOptions.removeScripts = false;
				cleanOptions.removeStyles = false;
				cleanOptions.removeAttributes = false;
				cleanOptions.excludedAttributes = '';
				cleanOptions.excludedSelectors = '';
				cleanOptions.excludedTags = '';
			}

			try {
				const $ = cheerio.load(htmlContent);

				// Remove comments if specified
				if (cleanOptions.removeComments) {
					$('*').each((_, element) => {
						// Remove comments from the element
						const comments = $(element).contents().filter((_, node) => node.type === 'comment');
						comments.remove();
					})
				}

				// Remove empty tags if specified
				if (cleanOptions.removeEmptyTags) {
					$('*').each((_, element) => {
						// Remove empty tags
						if ($(element).is(':empty')) {
							$(element).remove();
						}
					})
				}

				// Remove script tags if specified
				if (cleanOptions.removeScripts) {
					$('script').each((_, element) => {
						$(element).remove();
					});
				}

				// Remove style tags if specified
				if (cleanOptions.removeStyles) {
					$('style').each((_, element) => {
						$(element).remove();
					});
				}

				// Remove attributes if specified
				if (cleanOptions.removeAttributes) {
					$('*').each((_, element) => {
						const attributes = $(element).attr();
						attributes && Object.keys(attributes).forEach(attrName => {
							$(element).removeAttr(attrName);
						});
					});
				}

				// Remove excluded attributes if specified
				if (!cleanOptions.removeAttributes && cleanOptions.excludedAttributes) {
					const excludedAttributes = cleanOptions.excludedAttributes.split(',').map((attr: string) => attr.trim());
					$('*').each((_, element) => {
						excludedAttributes.forEach(attrName => {
							$(element).removeAttr(attrName);
						});
					});
				}

				// Remove excluded selectors if specified
				if (cleanOptions.excludedSelectors) {
					const excludedSelectors = cleanOptions.excludedSelectors.split(',').map((selector: string) => selector.trim());
					excludedSelectors.forEach((selector: string) => {
						$(selector).remove();
					});
				}

				// Remove excluded tags if specified
				if (cleanOptions.excludedTags) {
					const excludedTags = cleanOptions.excludedTags.split(',').map((tag: string) => tag.trim());
					excludedTags.forEach((tag: string) => {
						$(tag).remove();
					});
				}


				// Readability options
				const readabilityOptions: any = this.getNodeParameter('readabilityOptions', itemIndex, {});

				// Set default values for Readability options if not provided
				if (Object.keys(readabilityOptions).length === 0) {
					readabilityOptions.charThreshold = 500; // Default character threshold
					readabilityOptions.classesToPreserve = ''; // Default empty string for classes to preserve
					readabilityOptions.disableJSONLD = false; // Default to not disable JSON-LD
					readabilityOptions.keepClasses = false; // Default to not keep all classes
					readabilityOptions.nbTopCandidates = 5; // Default number of top candidates
				}

				// Convert classesToPreserve from string to array if provided
				if (readabilityOptions.classesToPreserve) {
					if (typeof readabilityOptions.classesToPreserve === 'string') {
						readabilityOptions.classesToPreserve = readabilityOptions.classesToPreserve.split(',').map((cls: string) => cls.trim());
					}
				}

				// Create a JSDOM instance with the cleaned HTML content
				let dom: JSDOM = new JSDOM($.html(), {
					// Use the JSDOM options to parse HTML content
					contentType: 'text/html',
					includeNodeLocations: true, // Include node locations for better parsing
					pretendToBeVisual: true, // Pretend to be a visual browser for better rendering
				});

				// Parse the document with Readability
				// This will extract the main content from the HTML document
				// and return an article object with the cleaned content
				// The article object will contain properties like title, content, textContent, etc.
				let article: ReadabilityArticle | null = new Readability(dom.window.document, readabilityOptions).parse();

				let outputContent:ICleanerOutput = {
					html: $.html(),
					title: article?.title || null,
					lang: article?.lang || null,
					content: article?.content || null,
					textContent: article?.textContent || null,
					length: article?.length || null,
					excerpt: article?.excerpt || null
				}

				const markdownOutput = this.getNodeParameter('markdownOutput', itemIndex, false) as boolean;

				if (markdownOutput) {
					// Convert the cleaned HTML to Markdown format
					const turndownService = new (require('turndown'))();
					outputContent.markdown = turndownService.turndown(article?.content || '');
				}

				// Add the cleaned HTML to the output
				output.push({
					json: {...outputContent},
					pairedItem: {item: itemIndex}
				});
			} catch
				(error) {
				if (this.continueOnFail()) {
					output.push({json: {error: error.message}, pairedItem: {item: itemIndex}});
				} else {
					throw error;
				}
			}
		}

		return this.prepareOutputData(output);
	}

}
