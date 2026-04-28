import React from "react";
import { Plus, Minus } from "lucide-react";

interface NumberInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "onChange"
> {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  min?: number;
  max?: number;
  step?: number;
}

export const NumberInput: React.FC<NumberInputProps> = ({
  value,
  onChange,
  label,
  min = 0,
  max,
  step = 1,
  className = "",
  ...props
}) => {
  const handleDecrement = () => {
    const newValue = parseFloat((value - step).toFixed(10));
    if (min !== undefined && newValue < min) return;
    onChange(newValue);
  };

  const handleIncrement = () => {
    const newValue = parseFloat((value + step).toFixed(10));
    if (max !== undefined && newValue > max) return;
    onChange(newValue);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (isNaN(val)) {
      onChange(0);
    } else {
      onChange(val);
    }
  };

  return (
    <div className="w-full">
      {label && (
        <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">
          {label}
        </label>
      )}
      <div className="relative group">
        <input
          type="number"
          value={value}
          onChange={handleInputChange}
          min={min}
          max={max}
          step={step}
          className={`w-full bg-white/5 border border-white/5 rounded-gr-2 px-gr-3 py-gr-2 pr-20 text-sm text-zinc-200 font-mono focus:outline-none focus:border-primary/50 focus:bg-white/10 transition-all smooth-transition ${className}`}
          {...props}
        />
        <div className="absolute right-1 top-1 bottom-1 flex gap-0.5">
          <button
            type="button"
            onClick={handleDecrement}
            className="h-full w-8 flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-white/10 rounded-gr-1 transition-all"
            title="减少"
          >
            <Minus size={14} />
          </button>
          <div className="w-[1px] h-4 bg-white/5 self-center" />
          <button
            type="button"
            onClick={handleIncrement}
            className="h-full w-8 flex items-center justify-center text-zinc-500 hover:text-primary hover:bg-primary/10 rounded-gr-1 transition-all"
            title="增加"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
