import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Alpha, Hue, Saturation, useColor, type IColor as PickerColor } from 'react-color-palette';
import 'react-color-palette/css';
import { Section } from '../ui/section';

type ColorPickerPopoverProps = {
    isOpen: boolean;
    anchorRef: RefObject<HTMLButtonElement | null>;
    initialColor: string;
    onPreview: (hex: string) => void;
    onCommit: (hex: string) => void;
    onCancel: () => void;
};

function ColorPickerPopover({
    isOpen,
    anchorRef,
    initialColor,
    onPreview,
    onCommit,
    onCancel,
}: ColorPickerPopoverProps) {
    const popoverRef = useRef<HTMLDivElement | null>(null);
    const [color, setColor] = useColor(initialColor);
    const colorRef = useRef<PickerColor>(color);
    const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

    const updatePosition = useCallback(() => {
        const anchor = anchorRef.current;
        if (!anchor) return;
        const rect = anchor.getBoundingClientRect();
        const popoverWidth = popoverRef.current?.offsetWidth ?? 280;
        const popoverHeight = popoverRef.current?.offsetHeight ?? 320;
        const padding = 12;
        let top = rect.bottom + 8;
        let left = rect.left;
        const maxLeft = window.innerWidth - popoverWidth - padding;
        const maxTop = window.innerHeight - popoverHeight - padding;
        left = Math.min(Math.max(padding, left), Math.max(padding, maxLeft));
        if (top > maxTop && rect.top - popoverHeight - 8 > padding) {
            top = rect.top - popoverHeight - 8;
        } else {
            top = Math.min(top, maxTop);
        }
        setPosition({
            top,
            left,
        });
    }, [anchorRef]);

    useEffect(() => {
        if (!isOpen) return;
        const frame = window.requestAnimationFrame(() => updatePosition());
        return () => window.cancelAnimationFrame(frame);
    }, [isOpen, updatePosition]);

    useEffect(() => {
        if (!isOpen) return;
        const handleReposition = () => updatePosition();
        window.addEventListener('resize', handleReposition);
        window.addEventListener('scroll', handleReposition, true);
        return () => {
            window.removeEventListener('resize', handleReposition);
            window.removeEventListener('scroll', handleReposition, true);
        };
    }, [isOpen, updatePosition]);

    useEffect(() => {
        if (!isOpen) return;
        const handleOutside = (event: PointerEvent) => {
            const target = event.target as Node | null;
            console.log('target', target);
            if (!target) return;
            if (popoverRef.current?.contains(target)) return;
            if (anchorRef.current?.contains(target)) return;
            onCommit(colorRef.current.hex);
        };
        document.addEventListener('pointerdown', handleOutside);
        return () => document.removeEventListener('pointerdown', handleOutside);
    }, [isOpen, onCommit, anchorRef]);

    useEffect(() => {
        colorRef.current = color;
    }, [color]);

    const handleColorChange = useCallback(
        (nextColor: PickerColor) => {
            setColor(nextColor);
            colorRef.current = nextColor;
            onPreview(nextColor.hex);
        },
        [onPreview, setColor]
    );

    if (!isOpen || !position) return null;

    return createPortal(
        <div
            ref={popoverRef}
            className="color-picker-popover"
            style={{
                top: position.top,
                left: position.left,
            }}
        >
            <div className="color-picker-content">
                <Saturation height={160} color={color} onChange={handleColorChange} />
                <div className="color-picker-sliders">
                    <div className="color-picker-preview" style={{ backgroundColor: color.hex }} />
                    <div className="color-picker-rails">
                        <div className="color-picker-rail">
                            <span>Hue</span>
                            <Hue color={color} onChange={handleColorChange} />
                        </div>
                        <div className="color-picker-rail">
                            <span>Alpha</span>
                            <Alpha color={color} onChange={handleColorChange} />
                        </div>
                    </div>
                </div>
                <div className="color-picker-hex">{color.hex.toUpperCase()}</div>
            </div>
            <div className="color-picker-actions">
                <button className="color-picker-cancel" onClick={onCancel}>
                    Cancel
                </button>
                <button className="color-picker-apply" onClick={() => onCommit(color.hex)}>
                    Done
                </button>
            </div>
        </div>,
        document.body
    );
}

export function ColorPicker({
    displayColor,
    onOpenPicker,
    showPicker,
    onPreview,
    onCommit,
    onCancel,
    colorButtonRef,
}: {
    displayColor: string;
    onOpenPicker: () => void;
    showPicker: boolean;
    onPreview: (hex: string) => void;
    onCommit: (hex: string) => void;
    onCancel: () => void;
    colorButtonRef: RefObject<HTMLButtonElement | null>;
}) {
    const [draftColor, setDraftColor] = useState(displayColor);

    useEffect(() => {
        if (showPicker) {
            setDraftColor(displayColor);
        }
    }, [showPicker, displayColor]);

    return (
        <>
            <Section>
                <label>Color</label>
                <button
                    ref={colorButtonRef}
                    className="color-swatch"
                    onClick={onOpenPicker}
                    style={{ backgroundColor: displayColor }}
                    aria-label="Open color picker"
                />
            </Section>

            {showPicker && (
                <ColorPickerPopover
                    isOpen
                    anchorRef={colorButtonRef}
                    initialColor={draftColor}
                    onPreview={onPreview}
                    onCommit={onCommit}
                    onCancel={onCancel}
                />
            )}
        </>
    );
}
