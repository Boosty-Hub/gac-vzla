import * as React from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface ResponsiveModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}

export const ResponsiveModal = ({ open, onOpenChange, children, className }: ResponsiveModalProps) => {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className={cn("max-h-[92vh]", className)}>
          <ScrollArea className="overflow-y-auto px-4 pb-4">
            {children}
          </ScrollArea>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-h-[85vh] overflow-y-auto", className)}>
        {children}
      </DialogContent>
    </Dialog>
  );
};

export const ResponsiveModalHeader = ({ children, className }: { children: React.ReactNode; className?: string }) => {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <DrawerHeader className={cn("text-left", className)}>{children}</DrawerHeader>;
  }
  return <DialogHeader className={className}>{children}</DialogHeader>;
};

export const ResponsiveModalTitle = ({ children, className }: { children: React.ReactNode; className?: string }) => {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <DrawerTitle className={className}>{children}</DrawerTitle>;
  }
  return <DialogTitle className={className}>{children}</DialogTitle>;
};

export const ResponsiveModalFooter = ({ children, className }: { children: React.ReactNode; className?: string }) => {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <DrawerFooter className={cn("px-0", className)}>{children}</DrawerFooter>;
  }
  return <DialogFooter className={className}>{children}</DialogFooter>;
};
