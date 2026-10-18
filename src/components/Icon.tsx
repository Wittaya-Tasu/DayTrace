import { Moon, BriefcaseBusiness, Utensils, Sun, Car, Coffee, BookOpen, Heart, House, Users, Circle } from 'lucide-react';
const icons={moon:Moon,briefcase:BriefcaseBusiness,utensils:Utensils,sun:Sun,car:Car,coffee:Coffee,book:BookOpen,heart:Heart,home:House,users:Users,circle:Circle};
export function CategoryIcon({name,size=21}:{name:string;size?:number}){const Icon=icons[name as keyof typeof icons]??Circle;return <Icon size={size} strokeWidth={1.8} aria-hidden="true"/>;}
