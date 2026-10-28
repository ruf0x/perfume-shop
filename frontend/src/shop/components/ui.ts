import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** A router <Link> that looks like a button. The stock shadcn sizes are small; shoppers use thumbs. */
export const linkButton = (variant: 'default' | 'outline' | 'secondary' | 'ghost' = 'default', className?: string) =>
  cn(buttonVariants({ variant }), 'h-11 px-5 text-[0.95rem]', className)

/** Classes to make a real <Button> as tall as linkButton(). */
export const bigButton = 'h-11 px-5 text-[0.95rem]'
