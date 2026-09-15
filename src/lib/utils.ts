export function cn(...inputs: (string | undefined | null | false)[]): string {
  return inputs.filter(Boolean).join(' ');
}

export function getCategoryBadgeStyles(color: string) {
  switch (color) {
    case 'peach':
      return {
        bg: 'bg-[#FEECE6]',
        text: 'text-[#E05D3D]',
        border: 'border-[#FDDCD2]',
      };
    case 'blue':
      return {
        bg: 'bg-[#EBF3FE]',
        text: 'text-[#2563EB]',
        border: 'border-[#D7E6FC]',
      };
    case 'purple':
      return {
        bg: 'bg-[#F4EBFC]',
        text: 'text-[#8B5CF6]',
        border: 'border-[#E6D4FA]',
      };
    case 'mint':
      return {
        bg: 'bg-[#E6F8F0]',
        text: 'text-[#059669]',
        border: 'border-[#C8F0DC]',
      };
    case 'amber':
      return {
        bg: 'bg-[#FEF3C7]',
        text: 'text-[#D97706]',
        border: 'border-[#FDE68A]',
      };
    default:
      return {
        bg: 'bg-slate-100',
        text: 'text-slate-700',
        border: 'border-slate-200',
      };
  }
}
