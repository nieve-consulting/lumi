import { readHtmlPage, type PageAlternate } from "@/utils/htmlPage"
import { BaseDocumentLoader } from "@langchain/core/document_loaders/base"
import { Document } from "@langchain/core/documents"

// A web page's text as Markdown (see readHtmlPage), its title and the language and translations it declares. It parses HTML the caller already fetched (the website
// crawler fetches every page with safeFetch, which bounds the time and size and refuses private addresses), so it never makes
// a request itself
export class WebpageDocumentLoader extends BaseDocumentLoader {
  private title: string | undefined = undefined
  private lang: string | undefined = undefined
  private alternates: PageAlternate[] = []

  constructor(
    private html: string,
    private webpageId: string
  ) {
    super()
  }

  async load(): Promise<Document[]> {
    const { title, lang, alternates, markdown: text } = readHtmlPage(this.html)
    this.title = title
    this.lang = lang
    this.alternates = alternates

    // Headed by the page's title, so its chunks say what page they are from. A page without text has no content at all, which
    // the crawler leaves out of search
    const pageMd = text && this.title ? `# ${this.title}\n\n${text}` : text

    return [new Document({ metadata: { webpageId: this.webpageId }, pageContent: pageMd, id: this.webpageId })]
  }

  getTitle(): string | undefined {
    return this.title
  }

  // The language on the page's <html> element and its hreflang links, for readPageLanguage
  getLanguageTags(): { lang: string | undefined; alternates: PageAlternate[] } {
    return { lang: this.lang, alternates: this.alternates }
  }
}
