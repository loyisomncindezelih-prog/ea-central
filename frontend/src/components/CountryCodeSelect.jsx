import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CODES = [
  { code: "+1",   country: "USA / Canada" },
  { code: "+44",  country: "United Kingdom" },
  { code: "+91",  country: "India" },
  { code: "+61",  country: "Australia" },
  { code: "+49",  country: "Germany" },
  { code: "+33",  country: "France" },
  { code: "+34",  country: "Spain" },
  { code: "+39",  country: "Italy" },
  { code: "+81",  country: "Japan" },
  { code: "+82",  country: "South Korea" },
  { code: "+86",  country: "China" },
  { code: "+852", country: "Hong Kong" },
  { code: "+65",  country: "Singapore" },
  { code: "+60",  country: "Malaysia" },
  { code: "+62",  country: "Indonesia" },
  { code: "+63",  country: "Philippines" },
  { code: "+66",  country: "Thailand" },
  { code: "+84",  country: "Vietnam" },
  { code: "+92",  country: "Pakistan" },
  { code: "+880", country: "Bangladesh" },
  { code: "+971", country: "UAE" },
  { code: "+966", country: "Saudi Arabia" },
  { code: "+20",  country: "Egypt" },
  { code: "+27",  country: "South Africa" },
  { code: "+234", country: "Nigeria" },
  { code: "+254", country: "Kenya" },
  { code: "+55",  country: "Brazil" },
  { code: "+52",  country: "Mexico" },
  { code: "+54",  country: "Argentina" },
  { code: "+56",  country: "Chile" },
  { code: "+57",  country: "Colombia" },
  { code: "+90",  country: "Turkey" },
  { code: "+7",   country: "Russia" },
  { code: "+380", country: "Ukraine" },
  { code: "+48",  country: "Poland" },
  { code: "+31",  country: "Netherlands" },
  { code: "+46",  country: "Sweden" },
  { code: "+47",  country: "Norway" },
  { code: "+45",  country: "Denmark" },
  { code: "+358", country: "Finland" },
  { code: "+41",  country: "Switzerland" },
  { code: "+43",  country: "Austria" },
  { code: "+30",  country: "Greece" },
  { code: "+353", country: "Ireland" },
  { code: "+351", country: "Portugal" },
  { code: "+972", country: "Israel" },
  { code: "+64",  country: "New Zealand" },
];

export const CountryCodeSelect = ({ value, onChange, testId = "country-code-select" }) => {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        className="w-[120px] bg-transparent border-white/20 focus:border-[#1E90FF] text-white rounded-none h-12"
        data-testid={testId}
      >
        <SelectValue placeholder="Code" />
      </SelectTrigger>
      <SelectContent className="bg-black border border-white/15 text-white max-h-72">
        {CODES.map((c) => (
          <SelectItem
            key={c.code}
            value={c.code}
            className="focus:bg-[#1E90FF]/15 focus:text-white"
            data-testid={`country-code-${c.code}`}
          >
            <span className="font-mono">{c.code}</span>
            <span className="text-white/50 ml-2">{c.country}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default CountryCodeSelect;
