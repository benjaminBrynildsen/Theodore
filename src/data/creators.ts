export interface Creator {
  slug: string;
  firstName: string;
  fullName: string;
  channelName: string;
  channelUrl: string;
  photo: string;
  handle: string;
}

export const CREATORS: Creator[] = [
  { slug: 'malva', firstName: 'Malva', fullName: 'Malva', channelName: 'Malva AI', channelUrl: 'https://www.youtube.com/@malvaAI', photo: '/creators/malva.jpg', handle: '@malvaAI' },
  { slug: 'manu', firstName: 'Manu', fullName: 'Manu Arora', channelName: 'Manu Arora', channelUrl: 'https://www.youtube.com/@manuarora', photo: '/creators/manu.jpg', handle: '@manuarora' },
  { slug: 'tommy', firstName: 'Tommy', fullName: 'Tommy Geoco', channelName: 'Tommy Geoco', channelUrl: 'https://www.youtube.com/@designertom', photo: '/creators/tommy.jpg', handle: '@designertom' },
  { slug: 'tom', firstName: 'Tom', fullName: 'Tom', channelName: 'The AI Growth Lab with Tom', channelUrl: 'https://www.youtube.com/@theaigrowthlabwithtom', photo: '/creators/tom.jpg', handle: '@theaigrowthlabwithtom' },
  { slug: 'thomas', firstName: 'Thomas', fullName: 'Thomas Lundström', channelName: 'Thomas Lundström', channelUrl: 'https://www.youtube.com/@thomaslundstrm', photo: '/creators/thomas.jpg', handle: '@thomaslundstrm' },
  { slug: 'dan', firstName: 'Dan', fullName: 'Dan Kieft', channelName: 'Dan Kieft', channelUrl: 'https://www.youtube.com/@Dankieft', photo: '/creators/dan.jpg', handle: '@Dankieft' },
  { slug: 'dom', firstName: 'Dom', fullName: 'Dom', channelName: 'Tech Tutor Zones', channelUrl: 'https://www.youtube.com/@TechTutorZones', photo: '/creators/dom.jpg', handle: '@TechTutorZones' },
  { slug: 'alamin', firstName: 'Alamin', fullName: 'Alamin', channelName: '8020ai', channelUrl: 'https://www.youtube.com/@iam_chonchol', photo: '/creators/alamin.jpg', handle: '@iam_chonchol' },
  { slug: 'tim', firstName: 'Tim', fullName: 'Tim Harris', channelName: 'Tim Harris AI', channelUrl: 'https://www.youtube.com/@TimHarrisAI', photo: '/creators/tim.jpg', handle: '@TimHarrisAI' },
  { slug: 'artturi', firstName: 'Artturi', fullName: 'Artturi', channelName: 'Artturi Explores', channelUrl: 'https://www.youtube.com/@artturiexplores', photo: '/creators/artturi.jpg', handle: '@artturiexplores' },
  { slug: 'bitnext', firstName: 'the BitNext team', fullName: 'BitNext', channelName: 'BitNext', channelUrl: 'https://www.youtube.com/@TheBitNext', photo: '/creators/bitnext.jpg', handle: '@TheBitNext' },
  { slug: 'ken', firstName: 'Ken', fullName: 'Ken Fornari', channelName: 'Ken Fornari', channelUrl: 'https://www.youtube.com/@KenFornari', photo: '/creators/ken.jpg', handle: '@KenFornari' },
];

export function findCreator(slug: string | undefined | null): Creator | null {
  if (!slug) return null;
  const norm = slug.toLowerCase().trim();
  return CREATORS.find((c) => c.slug === norm) ?? null;
}
