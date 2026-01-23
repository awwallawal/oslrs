import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../../../components/ui/accordion';

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQAccordionProps {
  /** Array of FAQ items */
  items: FAQItem[];
  /** Optional title for the section */
  title?: string;
}

/**
 * FAQAccordion - Accessible accordion for FAQ sections.
 *
 * Uses shadcn Accordion component with keyboard navigation support.
 */
function FAQAccordion({ items, title }: FAQAccordionProps) {
  return (
    <div>
      {title && (
        <h2 className="text-2xl lg:text-3xl font-brand font-semibold text-neutral-900 mb-6">
          {title}
        </h2>
      )}
      <Accordion type="single" collapsible className="w-full">
        {items.map((item, index) => (
          <AccordionItem key={index} value={`item-${index}`} className="border-neutral-200">
            <AccordionTrigger className="text-left text-neutral-900 hover:text-primary-600 hover:no-underline py-4">
              {item.question}
            </AccordionTrigger>
            <AccordionContent className="text-neutral-600 pb-4">
              {item.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

export { FAQAccordion };
export type { FAQItem };
