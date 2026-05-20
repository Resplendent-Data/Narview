import { openUrl } from "@tauri-apps/plugin-opener";
import { Check, Copy } from "lucide-react";
import { isValidElement, useState } from "react";
import type { AnchorHTMLAttributes, ComponentPropsWithoutRef, MouseEvent, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { cn } from "../lib/utils";

type MarkdownContentProps = {
  value: string | null | undefined;
  className?: string;
  emptyFallback?: ReactNode;
};

const markdownSchema = {
  ...defaultSchema,
  tagNames: Array.from(new Set([...(defaultSchema.tagNames ?? []), "details", "summary"])),
  attributes: {
    ...defaultSchema.attributes,
    a: [["href"], ["title"]],
    code: [["className"]],
  },
};

export function MarkdownContent({ value, className, emptyFallback = null }: MarkdownContentProps) {
  const source = value?.trim();

  if (!source) {
    return emptyFallback ? <>{emptyFallback}</> : null;
  }

  return (
    <div className={cn("markdown-body", className)}>
      <ReactMarkdown
        rehypePlugins={[rehypeRaw, [rehypeSanitize, markdownSchema]]}
        remarkPlugins={[remarkGfm]}
        components={{
          a: MarkdownLink,
          pre: MarkdownPre,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}

type MarkdownPreProps = ComponentPropsWithoutRef<"pre"> & {
  node?: unknown;
};

function MarkdownPre({ children, node: _node, ...props }: MarkdownPreProps) {
  const [copied, setCopied] = useState(false);
  const codeText = extractText(children).replace(/\n$/, "");

  const handleCopy = async () => {
    if (!codeText || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(codeText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };

  return (
    <div className="markdown-code-block">
      <button
        aria-label={copied ? "Code copied" : "Copy code"}
        className="markdown-code-copy"
        disabled={!codeText}
        onClick={() => void handleCopy()}
        type="button"
      >
        {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
        <span>{copied ? "Copied" : "Copy"}</span>
      </button>
      <pre {...props}>{children}</pre>
    </div>
  );
}

function MarkdownLink({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const safeHref = getSafeHref(href);

  const handleClick = async (event: MouseEvent<HTMLAnchorElement>) => {
    if (!safeHref) {
      return;
    }

    event.preventDefault();
    await openUrl(safeHref);
  };

  return (
    <a {...props} href={safeHref} onClick={handleClick} rel="noreferrer" target="_blank">
      {children}
    </a>
  );
}

function getSafeHref(href: string | undefined) {
  if (!href) {
    return undefined;
  }

  try {
    const url = new URL(href, "https://github.com");
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function extractText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map((child) => extractText(child)).join("");
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    return extractText(node.props.children);
  }

  return "";
}
