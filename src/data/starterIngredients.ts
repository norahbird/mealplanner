import type { StorageLocation } from './types';

export interface StarterIngredient {
  name: string;
  section: string;
  location: StorageLocation;
  /** Typical days it keeps once bought; null for long-life items. */
  days: number | null;
  staple: boolean;
}

// name | days (blank = long-life) | location (f = fridge, z = freezer, p = pantry) | * = staple
const LIST: Record<string, string> = {
  Produce: `
    onion|30|p; red onion|30|p; shallot|30|p; garlic|60|p; ginger|21|f; potato|30|p; sweet potato|21|p;
    carrot|21|f; celery|14|f; bell pepper|7|f; jalapeño|10|f; tomato|5|p; cherry tomatoes|5|f;
    cucumber|7|f; zucchini|5|f; eggplant|5|f; broccoli|5|f; cauliflower|7|f; cabbage|30|f;
    green beans|5|f; asparagus|4|f; corn on the cob|3|f; mushrooms|5|f; spinach|5|f; kale|7|f;
    lettuce|5|f; arugula|4|f; mixed greens|5|f; green onion|7|f; cilantro|7|f; parsley|7|f; basil|5|f;
    mint|7|f; dill|7|f; thyme|10|f; rosemary|14|f; avocado|4|p; lemon|21|f; lime|21|f; apple|28|f;
    banana|5|p; berries|4|f; orange|21|f; butternut squash|60|p; brussels sprouts|7|f; bok choy|5|f;
    leek|10|f; tofu|7|f`,
  'Meat & Seafood': `
    chicken breast|2|f; chicken thighs|2|f; whole chicken|2|f; ground beef|2|f; ground turkey|2|f;
    steak|3|f; pork chops|3|f; pork tenderloin|3|f; bacon|7|f; sausage|3|f; ham|5|f; deli turkey|5|f;
    salmon|2|f; white fish|2|f; shrimp|180|z`,
  'Dairy & Eggs': `
    eggs|28|f; milk|7|f; butter|60|f; heavy cream|10|f; half and half|7|f; sour cream|14|f;
    plain yogurt|14|f; greek yogurt|14|f; cheddar|28|f; mozzarella|14|f; parmesan|60|f; feta|14|f;
    cream cheese|14|f`,
  Bakery: `bread|5|p; tortillas|14|p; pita|5|p; naan|5|p; burger buns|5|p; bagels|4|p`,
  Pantry: `
    pasta||p; spaghetti||p; rice||p; brown rice||p; quinoa||p; rolled oats||p; couscous||p;
    lentils||p; rice noodles||p; flour||p|*; sugar||p|*; brown sugar||p; breadcrumbs||p; panko||p;
    peanut butter||p; honey||p; maple syrup||p; olive oil||p|*; vegetable oil||p|*; sesame oil||p;
    chicken broth||p; vegetable broth||p; walnuts||p; almonds||p; tortilla chips||p`,
  'Canned & Jarred': `
    diced tomatoes||p; crushed tomatoes||p; tomato paste||p; tomato sauce||p; black beans||p;
    chickpeas||p; kidney beans||p; cannellini beans||p; coconut milk||p; canned tuna||p;
    pasta sauce||p; salsa||p; olives||p; capers||p`,
  'Spices & Baking': `
    salt||p|*; black pepper||p|*; garlic powder||p; onion powder||p; paprika||p; smoked paprika||p;
    cumin||p; chili powder||p; oregano||p; italian seasoning||p; cinnamon||p; red pepper flakes||p;
    curry powder||p; turmeric||p; bay leaves||p; baking powder||p; baking soda||p;
    vanilla extract||p; cornstarch||p`,
  'Condiments & Sauces': `
    soy sauce||p; fish sauce||p; hot sauce||p; sriracha||p; ketchup||p; dijon mustard||p;
    mayonnaise|60|f; red wine vinegar||p; apple cider vinegar||p; balsamic vinegar||p; rice vinegar||p;
    worcestershire sauce||p; hoisin sauce||p; pesto|7|f; bbq sauce||p`,
  Frozen: `frozen peas|180|z; frozen corn|180|z; frozen spinach|180|z; frozen mixed vegetables|180|z; frozen berries|180|z`,
};

const LOC: Record<string, StorageLocation> = { f: 'fridge', z: 'freezer', p: 'pantry' };

export const STARTER_INGREDIENTS: StarterIngredient[] = Object.entries(LIST).flatMap(([section, text]) =>
  text
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [name, days, loc, staple] = entry.split('|');
      return {
        name: name.trim(),
        section,
        location: LOC[loc.trim()],
        days: days.trim() ? Number(days) : null,
        staple: staple?.trim() === '*',
      };
    }),
);
