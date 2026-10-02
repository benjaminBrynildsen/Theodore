// ========== Name Bank ==========
// AI models reach for the same names in every book (Marcus, Priya, Callie,
// Elena, Chen, Reyes…). This gives planning a varied pool to draw from —
// grouped by background and by generation, because a man born in 1950 and a
// girl born in 2012 in the same town don't share names — plus lists of names
// to avoid: model favorites, and names the author already used in other books.
//
// Pure — portable to the mobile app.

/** First names by generation: born ~1940-1964, ~1965-1989, ~1990-2009, 2010+. f/m marks the usual gender. */
interface NameGroup {
  label: string;
  older: string[];
  middle: string[];
  younger: string[];
  child: string[];
  surnames: string[];
}

export const NAME_GROUPS: NameGroup[] = [
  {
    label: 'Anglo-American (rural / small town)',
    older: ['Darlene/f', 'Wanda/f', 'Loretta/f', 'Judy/f', 'Bonnie/f', 'Earl/m', 'Dale/m', 'Vernon/m', 'Gary/m', 'Roy/m'],
    middle: ['Tammy/f', 'Shelly/f', 'Kristy/f', 'Dawn/f', 'Tonya/f', 'Travis/m', 'Shane/m', 'Rusty/m', 'Clint/m', 'Wade/m'],
    younger: ['Kaylee/f', 'Brittany/f', 'Haley/f', 'Shelby/f', 'Morgan/f', 'Colton/m', 'Tanner/m', 'Bryce/m', 'Cody/m', 'Dalton/m'],
    child: ['Paisley/f', 'Oaklynn/f', 'Brynlee/f', 'Remi/f', 'Kinsley/f', 'Ryker/m', 'Bentley/m', 'Ledger/m', 'Waylon/m', 'Brantley/m'],
    surnames: ['Pruitt', 'Lusk', 'Tidwell', 'Gaskins', 'Rutledge', 'Spivey', 'Overbey', 'Cagle', 'Pickens', 'Mabry', 'Dunlap', 'Haskins', 'Akers', 'Boggs', 'Crowder', 'Easley', 'Fugate', 'Goforth', 'Hensley', 'Isbell', 'Jernigan', 'Kittle', 'Lemaster', 'Puckett', 'Varner'],
  },
  {
    label: 'Anglo-American (suburban / urban)',
    older: ['Carol/f', 'Joan/f', 'Patricia/f', 'Marjorie/f', 'Diane/f', 'Richard/m', 'Gerald/m', 'Howard/m', 'Lawrence/m', 'Stanley/m'],
    middle: ['Jennifer/f', 'Heather/f', 'Melissa/f', 'Amy/f', 'Stacy/f', 'Brian/m', 'Todd/m', 'Jason/m', 'Scott/m', 'Greg/m'],
    younger: ['Madison/f', 'Taylor/f', 'Lauren/f', 'Abby/f', 'Megan/f', 'Tyler/m', 'Connor/m', 'Austin/m', 'Garrett/m', 'Spencer/m'],
    child: ['Harper/f', 'Quinn/f', 'Blake/f', 'Reese/f', 'Sloane/f', 'Hudson/m', 'Beckett/m', 'Grayson/m', 'Brooks/m', 'Crew/m'],
    surnames: ['Fenwick', 'Lindqvist', 'Prescott', 'Whitlock', 'Ambrose', 'Delaney', 'Pickering', 'Sutter', 'Haddon', 'Merrill', 'Coburn', 'Tolliver', 'Albright', 'Bancroft', 'Chalmers', 'Dorsett', 'Ellery', 'Fairchild', 'Garland', 'Hollis', 'Kimball', 'Langford', 'Pendleton', 'Radcliffe', 'Stanhope'],
  },
  {
    label: 'Irish',
    older: ['Maureen/f', 'Bridget/f', 'Kathleen/f', 'Peggy/f', 'Nora Jean/f', 'Francis/m', 'Seamus/m', 'Dermot/m', 'Brendan/m', 'Gerald/m'],
    middle: ['Siobhan/f', 'Colleen/f', 'Deirdre/f', 'Erin/f', 'Megan/f', 'Kieran/m', 'Declan/m', 'Ronan/m', 'Liam Joseph/m', 'Padraig/m'],
    younger: ['Aoife/f', 'Ciara/f', 'Niamh/f', 'Saoirse/f', 'Orla/f', 'Cillian/m', 'Oisin/m', 'Darragh/m', 'Cathal/m', 'Eoin/m'],
    child: ['Fiadh/f', 'Ailbhe/f', 'Clodagh/f', 'Grainne/f', 'Muireann/f', 'Tadhg/m', 'Fionn/m', 'Senan/m', 'Ruairi/m', 'Odhran/m'],
    surnames: ['Brennan', 'Mulcahy', 'Fogarty', 'Kinsella', 'Donnelly', 'Geraghty', 'Hanrahan', 'Moynihan', 'Tierney', 'Scanlon', 'McGuane', 'Dunphy', 'Ahearn', 'Byrne', 'Coughlin', 'Dempsey', 'Egan', 'Flanagan', 'Galvin', 'Halloran', 'Keating', 'Lynch', 'Mahony', 'Nolan', 'Sheehy'],
  },
  {
    label: 'Italian-American',
    older: ['Concetta/f', 'Rosaria/f', 'Philomena/f', 'Antoinette/f', 'Carmela/f', 'Salvatore/m', 'Carmine/m', 'Vincenzo/m', 'Angelo/m', 'Dominic/m'],
    middle: ['Gina/f', 'Lisa Marie/f', 'Donna/f', 'Theresa/f', 'Annette/f', 'Anthony/m', 'Joey/m', 'Paulie/m', 'Nicky/m', 'Frankie/m'],
    younger: ['Gianna/f', 'Alessia/f', 'Francesca/f', 'Bianca/f', 'Daniela/f', 'Matteo/m', 'Nico/m', 'Gianni/m', 'Enzo/m', 'Luca Paolo/m'],
    child: ['Aurora/f', 'Ginevra/f', 'Chiara/f', 'Noemi/f', 'Viola/f', 'Dante/m', 'Rocco/m', 'Lorenzo/m', 'Tommaso/m', 'Santino/m'],
    surnames: ['Abbatiello', 'Giordano', 'Caputo', 'Sciortino', 'Mastrangelo', 'Tedesco', 'Lombardi', 'Ferrigno', 'Bucci', 'Pellegrino', 'DiNapoli', 'Scarpa', 'Amato', 'Barone', 'Cirillo', 'DeLuca', 'Esposito', 'Fiore', 'Gallo', 'Iannucci', 'LaRocca', 'Marchetti', 'Napolitano', 'Russo', 'Vitale'],
  },
  {
    label: 'German / Scandinavian (Upper Midwest)',
    older: ['Gertrude/f', 'Arlene/f', 'Ingrid/f', 'Lorraine/f', 'Marlys/f', 'Arnold/m', 'Elmer/m', 'Harlan/m', 'Gunnar/m', 'Orville/m'],
    middle: ['Kristin/f', 'Heidi/f', 'Gretchen/f', 'Britt/f', 'Kari/f', 'Lars/m', 'Erik/m', 'Kurt/m', 'Dirk/m', 'Nils/m'],
    younger: ['Annika/f', 'Signe/f', 'Hanna Lise/f', 'Elsa/f', 'Greta/f', 'Anders/m', 'Soren/m', 'Torin/m', 'Henrik/m', 'Magnus/m'],
    child: ['Linnea/f', 'Astrid/f', 'Solveig/f', 'Tove/f', 'Ingrid Mae/f', 'Leif/m', 'Bjorn/m', 'Odin/m', 'Axel/m', 'Thorsten/m'],
    surnames: ['Brekke', 'Halvorsen', 'Lindgren', 'Ostrander', 'Schaefer', 'Vogel', 'Kranz', 'Nygaard', 'Tollefson', 'Ruud', 'Hoffmeier', 'Engebretson', 'Aasen', 'Bauer', 'Dahlberg', 'Eggers', 'Fjeld', 'Gunderson', 'Hagen', 'Jorgensen', 'Kloster', 'Moe', 'Rasmussen', 'Steinke', 'Wendt'],
  },
  {
    label: 'Polish / Slavic / Eastern European',
    older: ['Stella/f', 'Helen/f', 'Wanda/f', 'Irene/f', 'Bernice/f', 'Stanley/m', 'Casimir/m', 'Walter/m', 'Edmund/m', 'Thaddeus/m'],
    middle: ['Danuta/f', 'Renata/f', 'Beata/f', 'Krystyna/f', 'Irina/f', 'Pawel/m', 'Dariusz/m', 'Tomasz/m', 'Dmitri/m', 'Andrzej/m'],
    younger: ['Zofia/f', 'Kasia/f', 'Natalia/f', 'Oksana/f', 'Milena/f', 'Bartek/m', 'Kuba/m', 'Mateusz/m', 'Bogdan/m', 'Oleksandr/m'],
    child: ['Hania/f', 'Zuzanna/f', 'Lilia/f', 'Wiktoria/f', 'Mila/f', 'Antoni/m', 'Szymon/m', 'Ignacy/m', 'Wojtek/m', 'Mykola/m'],
    surnames: ['Wozniak', 'Grabowski', 'Zielinski', 'Majewski', 'Sobczak', 'Kaminski', 'Dudek', 'Pawlak', 'Bondarenko', 'Lysenko', 'Novotny', 'Dvorak', 'Adamczyk', 'Borkowski', 'Cieslak', 'Dabrowski', 'Filipek', 'Jablonski', 'Kozlowski', 'Lewandowski', 'Nowicki', 'Petrenko', 'Rutkowski', 'Szymanski', 'Wrobel'],
  },
  {
    label: 'Mexican / Mexican-American',
    older: ['Guadalupe/f', 'Socorro/f', 'Refugio/f', 'Consuelo/f', 'Esperanza/f', 'Jesus/m', 'Ramon/m', 'Ignacio/m', 'Rodolfo/m', 'Arturo/m'],
    middle: ['Yolanda/f', 'Norma/f', 'Leticia/f', 'Veronica/f', 'Adriana/f', 'Rogelio/m', 'Hector/m', 'Ruben/m', 'Armando/m', 'Javier/m'],
    younger: ['Ximena/f', 'Daniela/f', 'Itzel/f', 'Yesenia/f', 'Marisol/f', 'Alejandro/m', 'Emiliano/m', 'Joaquin/m', 'Uriel/m', 'Brandon/m'],
    child: ['Camila/f', 'Valentina/f', 'Regina/f', 'Renata/f', 'Romina/f', 'Santiago/m', 'Iker/m', 'Thiago/m', 'Leonel/m', 'Dylan/m'],
    surnames: ['Villalobos', 'Cardenas', 'Zamora', 'Arellano', 'Tovar', 'Ochoa', 'Bustamante', 'Saucedo', 'Robles', 'Quintanilla', 'Esparza', 'Macias', 'Alvarado', 'Barragan', 'Castaneda', 'Delgado', 'Escobedo', 'Figueroa', 'Guerrero', 'Ibarra', 'Jaramillo', 'Leyva', 'Medrano', 'Navarrete', 'Salcido'],
  },
  {
    label: 'Caribbean / Central & South American',
    older: ['Altagracia/f', 'Milagros/f', 'Nilda/f', 'Carmen Iris/f', 'Elba/f', 'Efrain/m', 'Wilfredo/m', 'Nestor/m', 'Gilberto/m', 'Osvaldo/m'],
    middle: ['Yadira/f', 'Maribel/f', 'Lissette/f', 'Zoraida/f', 'Ingrid/f', 'Edwin/m', 'Wilson/m', 'Freddy/m', 'Jairo/m', 'Giovanni/m'],
    younger: ['Yaritza/f', 'Nayeli/f', 'Genesis/f', 'Dayana/f', 'Yamilet/f', 'Yadiel/m', 'Kelvin/m', 'Anderson/m', 'Jeison/m', 'Yandel/m'],
    child: ['Aitana/f', 'Lucia Belen/f', 'Antonella/f', 'Ainhoa/f', 'Paloma/f', 'Gael/m', 'Mateo Andres/m', 'Benicio/m', 'Lian/m', 'Jeremias/m'],
    surnames: ['Batista', 'Peralta', 'Almonte', 'Rosario', 'Cordero', 'Henriquez', 'Galeano', 'Urbina', 'Montalvo', 'Benitez', 'Polanco', 'Echeverria', 'Acevedo', 'Betancourt', 'Caceres', 'Duarte', 'Escalante', 'Fajardo', 'Guzman', 'Lantigua', 'Matos', 'Nunez', 'Pacheco', 'Rodriguez Paz', 'Valdivia'],
  },
  {
    label: 'African American',
    older: ['Odessa/f', 'Hattie/f', 'Ernestine/f', 'Bernadine/f', 'Lucille/f', 'Otis/m', 'Clarence/m', 'Lonnie/m', 'Cleveland/m', 'Booker/m'],
    middle: ['Tamika/f', 'Latoya/f', 'Keisha/f', 'Monique/f', 'Tasha/f', 'Darnell/m', 'Terrence/m', 'Jerome/m', 'Reggie/m', 'Cedric/m'],
    younger: ['Jasmine/f', 'Destiny/f', 'Kiara/f', 'Aaliyah/f', 'Brianna/f', 'Jalen/m', 'Darius/m', 'Tre/m', 'DeAndre/m', 'Jamal/m'],
    child: ['Nevaeh/f', 'Zuri/f', 'Amani/f', 'Ayanna/f', 'Journee/f', 'Josiah/m', 'Messiah/m', 'Zion/m', 'Kairo/m', 'Amir/m'],
    surnames: ['Washington', 'Merriweather', 'Toussaint', 'Pettaway', 'Gaines', 'Battle', 'Ellison', 'Dorsey', 'Whitfield', 'Fairley', 'Mosley', 'Peoples', 'Abernathy', 'Bledsoe', 'Clemons', 'Dupree', 'Freeman', 'Gholston', 'Hairston', 'Ivory', 'Jefferson', 'Lattimore', 'Moton', 'Rucker', 'Spates'],
  },
  {
    label: 'West African (Nigerian, Ghanaian)',
    older: ['Comfort/f', 'Grace Adjoa/f', 'Felicia/f', 'Yetunde/f', 'Ngozi/f', 'Kwabena/m', 'Olusegun/m', 'Emeka/m', 'Kofi/m', 'Babatunde/m'],
    middle: ['Funmilayo/f', 'Chioma/f', 'Abena/f', 'Folake/f', 'Adaeze/f', 'Chinedu/m', 'Yaw/m', 'Tunde/m', 'Ikenna/m', 'Kwame/m'],
    younger: ['Adaora/f', 'Ewurabena/f', 'Temitope/f', 'Ifeoma/f', 'Akosua/f', 'Obinna/m', 'Kelechi/m', 'Ayodele/m', 'Kojo/m', 'Femi/m'],
    child: ['Ayomide/f', 'Chimamanda/f', 'Esi/f', 'Oluwaseun/f', 'Adwoa/f', 'Chidi/m', 'Kweku/m', 'Tobenna/m', 'Damilare/m', 'Nana Kwesi/m'],
    surnames: ['Adeyemi', 'Mensah', 'Nwosu', 'Asante', 'Ogunleye', 'Boateng', 'Eze', 'Owusu', 'Adebayo', 'Ofori', 'Chukwu', 'Danquah', 'Acheampong', 'Afolabi', 'Agyeman', 'Amadi', 'Appiah', 'Bello', 'Darko', 'Igwe', 'Kuffour', 'Nnamdi', 'Ogbonna', 'Oyelaran', 'Sarpong'],
  },
  {
    label: 'Chinese / Chinese-American',
    older: ['Mei-Ling/f', 'Shu-fen/f', 'Lily/f', 'Pearl/f', 'Ruby/f', 'Wing/m', 'Henry/m', 'Kwok-Wai/m', 'Albert/m', 'Jian/m'],
    middle: ['Xiaomei/f', 'Wendy/f', 'Fang/f', 'Ling/f', 'Annie/f', 'Wei/m', 'Gordon/m', 'Hong/m', 'Calvin/m', 'Zhiwei/m'],
    younger: ['Yuqi/f', 'Jiayi/f', 'Vivian/f', 'Xinyi/f', 'Tiffany/f', 'Haoran/m', 'Kevin/m', 'Zihan/m', 'Justin/m', 'Yichen/m'],
    child: ['Yutong/f', 'Ruoxi/f', 'Chloe Xin/f', 'Zixuan/f', 'Anya Lin/f', 'Muchen/m', 'Ethan Yu/m', 'Haoyu/m', 'Lucas Ming/m', 'Zeyu/m'],
    surnames: ['Leung', 'Tsang', 'Kwan', 'Yeung', 'Fong', 'Soong', 'Hsu', 'Ng', 'Lau', 'Tan', 'Guo', 'Pang', 'Chiu', 'Deng', 'Fung', 'Ho', 'Kuo', 'Lam', 'Luo', 'Mak', 'Shen', 'Tse', 'Wong', 'Xie', 'Zhou'],
  },
  {
    label: 'Korean / Japanese / Southeast Asian',
    older: ['Soon-ja/f', 'Kazuko/f', 'Michiko/f', 'Young-hee/f', 'Lan/f', 'Byung-ho/m', 'Hiroshi/m', 'Tadashi/m', 'Sang-woo/m', 'Minh/m'],
    middle: ['Ji-young/f', 'Yuko/f', 'Mai/f', 'Hyun-joo/f', 'Thuy/f', 'Sung-min/m', 'Takeshi/m', 'Tuan/m', 'Jae-hyun/m', 'Somchai/m'],
    younger: ['Seo-yeon/f', 'Haruka/f', 'Linh/f', 'Nari/f', 'Ploy/f', 'Min-jun/m', 'Ren/m', 'Khoa/m', 'Hyun-woo/m', 'Kiet/m'],
    child: ['Ha-eun/f', 'Himari/f', 'Bao Ngoc/f', 'Yuna/f', 'Pim/f', 'Do-yun/m', 'Haruto/m', 'Minh Khang/m', 'Si-woo/m', 'Sora/m'],
    surnames: ['Baek', 'Hwang', 'Jung', 'Takeda', 'Morimoto', 'Fujii', 'Nguyen Van', 'Tran', 'Pham', 'Vang', 'Xiong', 'Srisai', 'Ahn', 'Chang', 'Hirano', 'Ishikawa', 'Kwon', 'Le', 'Matsuda', 'Oh', 'Phan', 'Sato', 'Seo', 'Vu', 'Yamada'],
  },
  {
    label: 'South Asian (Indian, Pakistani, Bangladeshi)',
    older: ['Kamala/f', 'Shanti/f', 'Saroj/f', 'Nasreen/f', 'Pushpa/f', 'Ramesh/m', 'Abdul/m', 'Gopal/m', 'Harbhajan/m', 'Iqbal/m'],
    middle: ['Sunita/f', 'Farzana/f', 'Deepa/f', 'Rekha/f', 'Shabnam/f', 'Sanjay/m', 'Imran/m', 'Vikram/m', 'Arif/m', 'Manoj/m'],
    younger: ['Ananya/f', 'Mehreen/f', 'Divya/f', 'Ishita/f', 'Sadia/f', 'Arjun/m', 'Faisal/m', 'Karthik/m', 'Zubair/m', 'Nikhil/m'],
    child: ['Aadhya/f', 'Myra/f', 'Inaya/f', 'Saanvi/f', 'Hoorain/f', 'Vihaan/m', 'Ayaan/m', 'Reyansh/m', 'Shayaan/m', 'Advik/m'],
    surnames: ['Venkataraman', 'Qureshi', 'Bhattacharya', 'Siddiqui', 'Iyer', 'Chaudhry', 'Mukherjee', 'Malhotra', 'Rahman', 'Gill', 'Deshpande', 'Kapoor', 'Agarwal', 'Banerjee', 'Chatterjee', 'Dutta', 'Ghosh', 'Hussain', 'Joshi', 'Khan', 'Menon', 'Nair', 'Pillai', 'Rao', 'Sethi'],
  },
  {
    label: 'Middle Eastern / North African',
    older: ['Samira/f', 'Leila/f', 'Fatima/f', 'Mariam/f', 'Nawal/f', 'Mahmoud/m', 'Khalil/m', 'Farid/m', 'Youssef/m', 'Nasser/m'],
    middle: ['Rania/f', 'Dalia/f', 'Hanan/f', 'Lubna/f', 'Ghada/f', 'Tarek/m', 'Walid/m', 'Bassam/m', 'Karim/m', 'Ziad/m'],
    younger: ['Yasmin/f', 'Lina/f', 'Nour/f', 'Dana/f', 'Rasha/f', 'Omar/m', 'Hamza/m', 'Bilal/m', 'Rami/m', 'Majd/m'],
    child: ['Jana/f', 'Malak/f', 'Ritaj/f', 'Talia/f', 'Sidra/f', 'Adam/m', 'Yamen/m', 'Ilyas/m', 'Rayan/m', 'Zayd/m'],
    surnames: ['Haddad', 'Khoury', 'Mansour', 'Saleh', 'Darwish', 'Nasrallah', 'Barakat', 'Hamdan', 'Aziz', 'Bitar', 'Sabbagh', 'Toumi', 'Abboud', 'Ayoub', 'Daher', 'Farah', 'Ghanem', 'Habib', 'Issa', 'Jaber', 'Karam', 'Maalouf', 'Nassar', 'Rizk', 'Zaher'],
  },
  {
    label: 'Jewish-American',
    older: ['Miriam/f', 'Shirley/f', 'Estelle/f', 'Rhoda/f', 'Bernice Ruth/f', 'Morris/m', 'Irving/m', 'Saul/m', 'Herschel/m', 'Murray/m'],
    middle: ['Rachel/f', 'Debra/f', 'Ilana/f', 'Shira/f', 'Jodi/f', 'Adam Lev/m', 'Ari/m', 'Josh/m', 'Benjamin/m', 'Mitchell/m'],
    younger: ['Talia/f', 'Rebecca/f', 'Noa/f', 'Hannah/f', 'Maya Ruth/f', 'Noah/m', 'Gabe/m', 'Eitan/m', 'Zach/m', 'Avi/m'],
    child: ['Shoshana/f', 'Yael/f', 'Liora/f', 'Adina/f', 'Tova/f', 'Asher/m', 'Micah/m', 'Gideon/m', 'Levi/m', 'Ezra Ben/m'],
    surnames: ['Feldman', 'Rosenthal', 'Kaplan', 'Abramowitz', 'Lieberman', 'Shapiro', 'Weinstock', 'Gottlieb', 'Mandelbaum', 'Pearlman', 'Adler', 'Birnbaum', 'Applebaum', 'Bernstein', 'Cohn', 'Eisenberg', 'Fishman', 'Goldfarb', 'Horowitz', 'Katz', 'Levitt', 'Markowitz', 'Sandler', 'Schechter', 'Zimmerman'],
  },
  {
    label: 'French / Québécois / Cajun',
    older: ['Yvette/f', 'Germaine/f', 'Colette/f', 'Ghislaine/f', 'Odile/f', 'Gaston/m', 'Lucien/m', 'Marcel/m', 'Armand/m', 'Remy Paul/m'],
    middle: ['Sylvie/f', 'Nathalie/f', 'Isabelle/f', 'Chantal/f', 'Josee/f', 'Luc/m', 'Stephane/m', 'Guy/m', 'Benoit/m', 'Alain/m'],
    younger: ['Camille/f', 'Elodie/f', 'Margaux/f', 'Juliette/f', 'Oceane/f', 'Mathis/m', 'Bastien/m', 'Antoine/m', 'Felix/m', 'Hugo/m'],
    child: ['Rose/f', 'Lea/f', 'Manon/f', 'Alice/f', 'Agathe/f', 'Gabin/m', 'Louis/m', 'Arthur/m', 'Edouard/m', 'Victor/m'],
    surnames: ['Thibodeaux', 'Boudreaux', 'Arceneaux', 'Gagnon', 'Pelletier', 'Lacroix', 'Fontenot', 'Bergeron', 'Ouellette', 'Robichaux', 'Deschamps', 'Marchand', 'Babineaux', 'Cormier', 'Daigle', 'Guidry', 'Hebert', 'LeBlanc', 'Melancon', 'Naquin', 'Perrault', 'Richard', 'Savoie', 'Thibault', 'Vautour'],
  },
  {
    label: 'Native American / Indigenous (contemporary)',
    older: ['Delphine/f', 'Ruby Mae/f', 'Hazel Ann/f', 'Viola/f', 'Agnes/f', 'Leonard/m', 'Russell/m', 'Wilbur/m', 'Chester/m', 'Floyd/m'],
    middle: ['Winona/f', 'Darcy/f', 'Charmaine/f', 'Renee/f', 'Lorelei/f', 'Waylon James/m', 'Duane/m', 'Lyle/m', 'Corey/m', 'Elton/m'],
    younger: ['Kateri/f', 'Shayla/f', 'Tayanita/f', 'Starla/f', 'Brielle/f', 'Dakota/m', 'Tyrell/m', 'Keanu/m', 'Tristan/m', 'Hunter/m'],
    child: ['Aiyana/f', 'Takoda/f', 'Halona/f', 'Nayeli Rose/f', 'Winter/f', 'Ahanu/m', 'Kodiak/m', 'Chayton/m', 'Mato/m', 'Kiyan/m'],
    surnames: ['Tsosie', 'Begay', 'Yazzie', 'Blackhorse', 'Redcloud', 'Two Bulls', 'Laughing', 'Roanhorse', 'Cornsilk', 'Whitehawk', 'Manygoats', 'Benally', 'Attakai', 'Bearpaw', 'Chee', 'Deschenie', 'Etsitty', 'Grass', 'Holiday', 'Lameman', 'Nez', 'Runningwater', 'Shorty', 'Thunderbird', 'Wolfchild'],
  },
  {
    label: 'British',
    older: ['Maureen Ann/f', 'Brenda/f', 'Jean/f', 'Sheila/f', 'Valerie/f', 'Clive/m', 'Derek/m', 'Malcolm/m', 'Nigel/m', 'Roger/m'],
    middle: ['Gemma/f', 'Kerry/f', 'Joanne/f', 'Nicola/f', 'Tracey/f', 'Gareth/m', 'Darren/m', 'Craig/m', 'Stuart/m', 'Dominic/m'],
    younger: ['Chloe/f', 'Jade/f', 'Bethany/f', 'Holly/f', 'Ellie/f', 'Callum/m', 'Kieran Lee/m', 'Jordan/m', 'Harvey/m', 'Rhys/m'],
    child: ['Poppy/f', 'Imogen/f', 'Freya/f', 'Esme/f', 'Matilda/f', 'Alfie/m', 'Archie/m', 'Reggie/m', 'Teddy/m', 'Ronnie/m'],
    surnames: ['Pemberton', 'Ashworth', 'Higginbottom', 'Featherstone', 'Brindley', 'Cartwright', 'Postlethwaite', 'Dunmore', 'Ramsbottom', 'Ackroyd', 'Halliwell', 'Thistlewood', 'Armitage', 'Bramwell', 'Crabtree', 'Dawlish', 'Entwistle', 'Fothergill', 'Greaves', 'Hepworth', 'Kershaw', 'Lumley', 'Openshaw', 'Sowerby', 'Wainwright'],
  },
];

/** Names AI models overuse across books. Planning avoids them unless the author asks. */
export const OVERUSED_NAMES = [
  'Marcus', 'Priya', 'Callie', 'Elena', 'Maya', 'Mira', 'Kai', 'Eli', 'Elias', 'Ezra', 'Silas', 'Theo', 'Theodore', 'Nora',
  'Iris', 'Lena', 'Luna', 'Aria', 'Zara', 'Jonah', 'Caleb', 'Clara', 'Elara', 'Lyra', 'Kael', 'Rowan', 'Sage', 'Finn',
  'Jasper', 'Wren', 'Juniper', 'Ivy', 'Hazel', 'Willa', 'Ada', 'Evelyn', 'Amara', 'Anya', 'Imani', 'Nadia', 'Rosa',
  'Marco', 'Dev', 'Rohan', 'Kenji', 'Hana', 'Mei', 'Aiden', 'Ethan', 'Sarah', 'Emily', 'Jack', 'Leo', 'Max', 'Sam',
  'Chen', 'Reyes', 'Okafor', 'Vance', 'Thorne', 'Blackwood', 'Hale', 'Kowalski', 'Nakamura', 'Patel', 'Sharma', 'Rivera',
  'Morales', 'Hayes', 'Cross', 'Sterling', 'Voss', 'Graves', 'Ashford', 'Holloway', 'Calloway', 'Whitaker', 'Mercer',
  'Bennett', 'Brooks', 'Hartley', 'Sinclair', 'Lockwood', 'Kim', 'Park', 'Hart', 'Stone', 'Wells',
];

function shuffled<T>(items: T[], rand: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** First names and surnames used in a set of names ("Wes Garrity" → Wes, Garrity). */
export function nameWords(names: string[]): string[] {
  const out = new Set<string>();
  for (const n of names) {
    for (const w of n.split(/\s+/)) {
      const t = w.replace(/[^\p{L}'-]/gu, '');
      if (t.length >= 2 && /^\p{Lu}/u.test(t)) out.add(t);
    }
  }
  return [...out];
}

/**
 * Prompt block for choosing names: a shuffled sample from every background and
 * generation, plus names to avoid (model favorites + the author's other books).
 */
export function buildNamingGuidance(opts: { avoid?: string[]; seed?: number; perGeneration?: number; surnames?: number } = {}): string {
  const rand = seeded(opts.seed ?? Math.floor(Math.random() * 2 ** 31));
  const per = opts.perGeneration ?? 3;
  const surnameCount = opts.surnames ?? 5;
  const avoid = new Set([...OVERUSED_NAMES, ...(opts.avoid || [])].map((n) => n.toLowerCase()));
  const pick = (list: string[], n: number) =>
    shuffled(list.filter((x) => !avoid.has(x.split('/')[0].split(' ')[0].toLowerCase())), rand).slice(0, n);

  const lines = shuffled(NAME_GROUPS, rand).map((g) => {
    const gen = (label: string, list: string[]) => `${label} ${pick(list, per).join(', ')}`;
    return `- ${g.label}: ${[
      gen('born 1940-64:', g.older),
      gen('1965-89:', g.middle),
      gen('1990-2009:', g.younger),
      gen('2010+:', g.child),
    ].join(' | ')} | surnames: ${pick(g.surnames, surnameCount).join(', ')}`;
  });

  const avoidList = [...new Set([...OVERUSED_NAMES, ...(opts.avoid || [])])];
  return `NAMING — choose names the way a careful novelist does:
- Fit each name to the character: the decade they were born, their family's background, and the place and community the story is set in. Most real towns are a mix; let the cast reflect who actually lives there.
- Draw from the sample below (or names of the same kind). /f and /m mark the usual gender; don't write the marker.
- Make the main cast easy to tell apart: different first letters, different lengths and sounds.
- Do NOT use these names (overused, or the leads of the author's other books): ${avoidList.join(', ')}.
Name sample:
${lines.join('\n')}`;
}
