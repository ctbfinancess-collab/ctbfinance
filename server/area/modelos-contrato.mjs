/**
 * Modelos de contrato da CTB Finances (texto + campos). Para acrescentar um modelo: inclua uma entrada em MODELOS
 * com `campos` (rótulo e valor padrão), `rotulo` (selo no topo da página), `texto(c)` (corpo, com marcação simples)
 * e `assinaturas(c)`. A marcação do corpo — a mesma do editor de texto livre no Admin — é:
 *   "# título" (centralizado) · "## seção" (negrito) · "• item" (marcador) · linha em branco separa parágrafos.
 */

/** Dados fixos da CTB nos contratos (constam dos modelos enviados pela titular). */
export const CTB = {
  razao: 'CTB FINANCE BROKER L.L.C',
  registro: '1821506',
  licenca: '717060',
  endereco: 'Boulevard Plaza Tower 1, Dubai, United Arab Emirates, P.O. Box 340733',
};

const NDA = {
  titulo: 'Non-Disclosure Agreement (NDA)',
  rotulo: 'NDA',
  // ordem = ordem do formulário no Admin. `origem` só documenta de onde vem o preenchimento automático.
  campos: [
    { k: 'data', rotulo: 'Data (DD/MM/AAAA)', origem: 'hoje (Dubai)' },
    { k: 'local', rotulo: 'Local', padrao: 'Dubai - United Arab Emirates (UAE)' },
    { k: 'empresa', rotulo: 'Cliente — empresa (ou nome)', origem: 'Meu perfil: empresa · senão nome do cliente' },
    { k: 'jurisdicao', rotulo: 'Constituída sob as leis de', padrao: 'the Federative Republic of Brazil', origem: 'Meu perfil: país da empresa' },
    { k: 'registro', rotulo: 'Nº de registro da empresa', origem: 'Meu perfil' },
    { k: 'endereco', rotulo: 'Endereço da empresa', origem: 'Meu perfil' },
    { k: 'prazo', rotulo: 'Vigência (anos)', padrao: 'two (2)' },
    { k: 'representante', rotulo: 'Representante legal', origem: 'Meu perfil: nome · ou ordenante da solicitação' },
    { k: 'cargoRep', rotulo: 'Cargo do representante', padrao: 'CEO', origem: 'Meu perfil: cargo na empresa' },
    { k: 'passaporte', rotulo: 'Passaporte do representante', origem: 'Meu perfil (número completo)' },
    { k: 'ctbNome', rotulo: 'CTB — nome de quem assina', origem: 'Configuração de assinatura' },
    { k: 'ctbCargo', rotulo: 'CTB — cargo', padrao: 'EXECUTIVE DIRECTOR' },
    { k: 'ctbPin', rotulo: 'CTB — PIN', padrao: '120422' },
  ],
  texto: (c) => `# NON-DISCLOSURE AGREEMENT – N.D.A.

Place: ${c.local}.

Date: ${c.data}

This Confidentiality Agreement ("Agreement") is made and entered into by and between:

${CTB.razao}, a company duly incorporated and registered under No. ${CTB.registro}, holding Commercial License No. ${CTB.licenca}, in accordance with the laws of the United Arab Emirates, with its principal office located at ${CTB.endereco} (hereinafter referred to as the "Receiving Party").

## AND

${c.empresa}, a company duly incorporated and existing under the laws of ${c.jurisdicao}, registered under No. ${c.registro}, with its principal place of business located at ${c.endereco} (hereinafter referred to as the "Disclosing Party").

## RECITALS

WHEREAS, the Disclosing Party and the Receiving Party (collectively, the "Parties") are entering into discussions for the potential business relationship (the "Purpose") and in the course of such discussions, the Disclosing Party will be disclosing certain confidential and proprietary information (the "Confidential Information") to the Receiving Party; and

WHEREAS, the Parties wish to protect the confidentiality of such information to avoid unauthorized use or disclosure.

NOW, THEREFORE, in consideration of the mutual promises and covenants contained herein, the Parties agree as follows:

## 1. Definition of Confidential Information

For the purposes of this Agreement, "Confidential Information" shall include, but not be limited to:

• All business, technical, financial, and proprietary information disclosed by the Disclosing Party, including, without limitation, trade secrets, business plans, marketing strategies, client lists, pricing structures, financial data, and any other data related to the Purpose.
• Any personal data, as defined under applicable laws, including the General Data Protection Regulation (GDPR), which may be shared in connection with the Purpose.

## 2. Obligations of the Receiving Party

The Receiving Party agrees to:

• Keep all Confidential Information confidential and not disclose it to any third parties without the prior written consent of the Disclosing Party, except as expressly permitted in this Agreement.
• Use the Confidential Information solely for the Purpose of evaluating or furthering the business relationship between the Parties.
• Take all reasonable precautions to prevent unauthorized disclosure or access to the Confidential Information, including, without limitation, restricting access to employees, contractors, or agents who need to know such information for the Purpose.

## 3. Exceptions to Confidentiality

The obligations of confidentiality set forth in this Agreement shall not apply to information that:

• Is already known to the Receiving Party prior to disclosure by the Disclosing Party;
• Is disclosed to the Receiving Party by a third party who is not in breach of any confidentiality obligation;
• Is independently developed by the Receiving Party without reference to the Confidential Information;
• Is required to be disclosed by law, regulation, or court order, provided that the Receiving Party gives the Disclosing Party reasonable notice to enable it to seek protective measures.

## 4. Protection of Personal Data

• The Parties acknowledge that the Confidential Information may include Personal Data, as defined under applicable laws. The Parties undertake to collect, store, process, transfer, and protect such Personal Data in strict compliance with the data protection laws in force in the United Arab Emirates, including the Federal Decree-Law No. 45 of 2021 on the Protection of Personal Data (PDPL), together with its implementing regulations, supplementary provisions, and any amendments thereto that may come into effect from time to time.
• Data Processing: If the Confidential Information involves the processing of personal data, the Parties agree that the Receiving Party will act as a data processor for the Disclosing Party, who is the data controller. The Receiving Party shall process the personal data only as necessary to fulfill the Purpose and in accordance with the instructions provided by the Disclosing Party.
• Data Security: The Receiving Party shall implement appropriate technical and organizational measures to safeguard the Confidential Information and ensure compliance with applicable data protection laws.

## 5. Term and Termination

• This Agreement shall be effective as of the date first written above and shall remain in effect for a period of ${c.prazo} years, unless terminated earlier by mutual written consent of the Parties.
• Upon termination or expiration of this Agreement, the Receiving Party shall promptly return or destroy all Confidential Information in its possession, including all copies thereof.

## 6. Intellectual Property

Nothing in this Agreement shall be construed as granting any rights or licenses under any intellectual property rights of the Disclosing Party, and all intellectual property rights in the Confidential Information remain the exclusive property of the Disclosing Party.

## 7. Indemnification

The Receiving Party shall indemnify and hold harmless the Disclosing Party from any damages, losses, or expenses arising out of the Receiving Party's breach of this Agreement, including unauthorized disclosure or use of the Confidential Information.

## 8. Governing Law and Jurisdiction

This Agreement shall be governed by and construed in accordance with the laws of United Arab Emirates (UAE), without regard to its conflict of law provisions. Any disputes arising out of or in connection with this Agreement shall be subject to the exclusive jurisdiction of the courts of Dubai, United Arab Emirates (UAE).

## 9. Non-Circumvention

The Parties agree that, during the term of this Agreement and for a period of five (5) years thereafter, neither Party shall, directly or indirectly, circumvent, avoid, bypass, or obviate the other Party in relation to any business opportunity, transaction, client, supplier, investor, intermediary, consultant, affiliate, or business relationship introduced or disclosed pursuant to the Purpose of this Agreement.

Neither Party shall enter into any agreement, negotiation, transaction, or business relationship with any such introduced party without the prior written consent of the introducing Party. Any breach of this provision shall constitute a material breach of this Agreement and shall entitle the injured Party to seek all available legal and equitable remedies.

## 10. Equitable Relief

The Receiving Party acknowledges that any unauthorized disclosure, use, or misappropriation of the Confidential Information may cause irreparable harm to the Disclosing Party for which monetary damages alone may be an inadequate remedy.

Accordingly, in the event of any actual or threatened breach of this Agreement, the Disclosing Party shall be entitled to seek immediate injunctive relief, specific performance, temporary restraining orders, or any other equitable remedies available under applicable law, without the necessity of proving actual damages or posting any bond or security, in addition to any other rights and remedies available at law or in equity.

## 11. Miscellaneous

• Entire Agreement: This Agreement constitutes the entire understanding between the Parties with respect to the subject matter hereof and supersedes all prior agreements or understandings, whether written or oral.
• Amendment: This Agreement may be amended or modified only by a written instrument executed by both Parties.
• Severability: If any provision of this Agreement is found to be invalid or unenforceable, the remaining provisions shall remain in full force and effect.
• Waiver: No waiver of any breach of this Agreement shall be deemed a waiver of any other breach or a continuing waiver.

IN WITNESS WHEREOF, the Parties have executed this Agreement as of the date first written above.`,
  assinaturas: (c) => [
    [`${c.ctbNome || '______________________'} - ${c.ctbCargo}`, `PIN - ${c.ctbPin}`, CTB.razao, `LICENSE No. ${CTB.licenca}`],
    [c.empresa, `Registered No. ${c.registro}`, `${c.cargoRep}: ${c.representante}`, `Passport: ${c.passaporte}`],
  ],
};

/** Abertura de conta — texto da titular com os ajustes combinados em 18/11/2026 (CTB como corretora/intermediária,
 *  não banco nem custodiante; instrumentos emitidos por instituição licenciada). */
const ABERTURA_CONTA = {
  titulo: 'Account Opening Agreement',
  rotulo: 'AO',
  umPorCliente: true,   // gerado automaticamente só se o cliente ainda não tiver um (não cancelado)
  campos: [
    { k: 'data', rotulo: 'Data (DD/MM/AAAA)', origem: 'hoje (Dubai)' },
    { k: 'local', rotulo: 'Local', padrao: 'Dubai - United Arab Emirates (UAE)' },
    { k: 'conta', rotulo: 'Número da conta', origem: 'gerado pelo sistema (fixo por cliente)' },
    { k: 'empresa', rotulo: 'Cliente — empresa (ou nome)', origem: 'Meu perfil: empresa · senão nome do cliente' },
    { k: 'jurisdicao', rotulo: 'Constituída sob as leis de', padrao: 'the Federative Republic of Brazil', origem: 'Meu perfil: país da empresa' },
    { k: 'registro', rotulo: 'Nº de registro da empresa', origem: 'Meu perfil' },
    { k: 'endereco', rotulo: 'Endereço da empresa', origem: 'Meu perfil' },
    { k: 'representante', rotulo: 'Representante legal', origem: 'Meu perfil: nome' },
    { k: 'cargoRep', rotulo: 'Cargo do representante', padrao: 'CEO', origem: 'Meu perfil: cargo na empresa' },
    { k: 'passaporte', rotulo: 'Passaporte do representante', origem: 'Meu perfil (número completo)' },
    { k: 'nacionalidade', rotulo: 'Nacionalidade do representante', origem: 'Meu perfil' },
    { k: 'telefone', rotulo: 'Telefone', origem: 'Meu perfil' },
    { k: 'ctbNome', rotulo: 'CTB — nome de quem assina', origem: 'Configuração de assinatura' },
    { k: 'ctbCargo', rotulo: 'CTB — cargo', padrao: 'EXECUTIVE DIRECTOR' },
    { k: 'ctbPin', rotulo: 'CTB — PIN', padrao: '301224' },
  ],
  texto: (c) => `# INVESTMENT ACCOUNT FOR FINANCIAL COLLATERAL OPERATIONS
# AGREEMENT OF ESTABLISHMENT

Place: ${c.local}.

Date: ${c.data}

${CTB.razao}, a company duly incorporated and registered under No. ${CTB.registro}, holding Commercial License No. ${CTB.licenca}, in accordance with the laws of the United Arab Emirates, with its principal office located at ${CTB.endereco} (hereinafter referred to as the "CTB FINANCES").

CLIENT: ${c.empresa}, a company duly incorporated and existing under the laws of ${c.jurisdicao}, registered under No. ${c.registro}, with its principal place of business located at ${c.endereco}.

## ACCOUNT NUMBER: ${c.conta}

The aforementioned parties have mutually entered into this INVESTMENT ACCOUNT FOR FINANCIAL COLLATERAL OPERATIONS - AGREEMENT OF ESTABLISHMENT, which shall govern the following clauses:

1. CTB FINANCES, a financial brokerage and consulting company, provides credit consulting, credit management, risk selection, accounts payable and receivable management support, and intermediation of guarantee and financial-instrument operations with licensed financial institutions.

2. The Client seeks guarantee and financial-instrument intermediation services and wishes to contract the services of CTB FINANCES, the receivables, assets and financial guarantees offered by the Client being held by licensed custodian or issuing financial institutions, with CTB FINANCES recording and following up such operations and, if necessary, assigning the rights related thereto in accordance with the applicable agreements.

3. The Client wishes to open their Investment Account for Financial Collateral Operations with CTB FINANCES, hereinafter referred to as the "INVESTMENT ACCOUNT". The term "INVESTMENT ACCOUNT" is a purely commercial nomenclature.

4. The INVESTMENT ACCOUNT is linked to the records of the receivables, assets and guarantees offered by the Client and held by licensed custodian institutions, for the fulfillment of the terms of the GUARANTEE AGREEMENT to be entered into between the Parties.

5. Opening an Investment Account does not guarantee the issuance of any instrument by a financial institution. The financial analysis of the Client's operations will follow CTB FINANCES standards and will depend on the quality of the credits, assets, and counter-guarantees offered by the Client, as well as the prevailing commercial and market context.

6. The specific terms of ancillary charges will complement this Contract.

7. The Client shall reimburse and indemnify CTB FINANCES within 24 hours in case of default on credits guaranteed by financial guarantee instruments issued at the Client's request through CTB FINANCES' intermediation, or upon presentation of these financial instruments for payment. For this item, the Client undertakes to reimburse and indemnify CTB FINANCES for the total value of the financial guarantee.

8. This Contract does not constitute a promise of payment of interest, profits, dividends, or any other income on investments or financial securities.

9. The Client is fully aware that, should the request to open an Investment Account be approved at the sole discretion of CTB FINANCES, after due Compliance due diligence, the Investment Account will be governed by the clauses and conditions established herein, as well as by current United Arab Emirates laws and international legislation applicable to the Contract.

10. The Client authorizes CTB FINANCES to create a client database based on the data and information provided and to consult and obtain all other data and information from central and registration bodies available in the UNITED ARAB EMIRATES, whether public or private. This authorization includes, but is not limited to, the possibility of consulting, obtaining and providing data to or from Credit Protection Agencies and Risk Centers.

11. After signing this Agreement, the Client will provide a completed Client Information Form, corporate documents, and other KYC (Know Your Customer) documents for analysis by CTB FINANCES.

12. CTB FINANCES will conduct a compliance investigation of the Client's documents and issue a positive or negative response within 20 (twenty) business days. In case of a positive response, CTB FINANCES will open an Investment Account for the Client.

13. The Client must provide adequate guarantees within 5 (five) business days after the opening of the Account, as per items 5 and 6.

14. The guarantee must include at least one promissory note as collateral for the total amount associated with the Investment Account and one promissory note as collateral for the commission associated with the issuance of the guarantee instruments.

15. The Client declares, under penalty of EMIRATE civil and criminal law, that the information and data provided for the opening of the investment account are accurate.

16. In case of any changes to the data, the Client agrees to immediately notify CTB FINANCES using the email addresses used for contact between the Parties.

17. After acceptance of the Client's registration, CTB FINANCES will inform the Client of their Investment Account number and access data for online inquiries/consultations.

18. If the registration is not accepted, CTB FINANCES reserves the right not to justify or clarify the reasons for its decision.

19. The Client will be solely responsible for the correct provision, confirmation, use, updating, and access to the contact email provided, exempting CTB FINANCES from any liability arising from the use of this communication system, as previously agreed between the parties.

20. In case of any change, the Client must immediately communicate the new email address to CTB FINANCES, without prejudice to the stipulations regarding liability in the previous clause.

21. The Investment Account will exclusively record the balance of the counter-guarantees offered by the Client and accepted by CTB FINANCES.

22. The Account will be opened and maintained exclusively as an individual account and represented only by individuals over 18 years of age or by a legal entity/business, and CTB FINANCES will not provide the Client with a magnetic bank card nor perform any banking operations.

23. The Client must send to CTB FINANCES, by email, to the address of the legal department, a legible digital copy of all documents pertaining to the opening of the Investment Account, in addition to those that may be requested occasionally for supplementary purposes.

24. The Client declares to be aware of EMIRATES legislation governing the crimes of "MONEY LAUNDERING", as well as the supplementary regulations promulgated by the competent authorities and bodies. Consequently, the Client acknowledges that CTB FINANCES is obliged, under these laws and regulations, to report to the competent EMIRATES authorities any transactions that may indicate cases of money laundering, terrorist financing, tax evasion and other related crimes.

25. The passwords registered by the Client are personal, non-transferable and confidential, and are the sole responsibility of the Client. They must be kept in absolute secrecy.

26. The competent EMIRATES authorities may establish procedures relating to the operation of the Investment Account described herein. In such cases, the conditions established herein may be changed by CTB FINANCES without prior notice.

27. CTB FINANCES will charge service fees for issuing account statements and other documents related to the Investment Account. The respective fees will be communicated before the requested document is issued.

28. The Investment Account may be closed by CTB FINANCES or the Client upon 30 days' prior notice, without incurring any penalties. Counter-guarantees granted by the Client will be maintained or extinguished in accordance with the provisions of the respective guarantee terms or factoring-guarantee contracts.

29. In case of non-compliance with the provisions of item 23, the Investment Account will be blocked. Full compliance with the stipulated formalities will be an essential condition for unblocking this restriction.

30. The English language shall govern the interpretation and validity of this Agreement.

31. All disputes arising out of or relating to this INVESTMENT ACCOUNT OPENING AGREEMENT FOR FINANCIAL COLLATERAL OPERATIONS shall be adjudicated exclusively in Dubai, United Arab Emirates, to the exclusion of any other jurisdiction, regardless of its potential privileges.

## ACCOUNT DETAILS

• Account type: INVESTMENT ACCOUNT FOR FINANCIAL COLLATERAL OPERATIONS
• Account number: ${c.conta}
• Company name: ${c.empresa}
• Based: ${c.endereco}
• ID: ${c.registro}
• Phone number: ${c.telefone}
• Legal representative: ${c.representante}
• Company position: ${c.cargoRep}
• Legal representative ID: ${c.passaporte}
• Nationality: ${c.nacionalidade}

## SIGNATURE CARD ASSOCIATED WITH THE INVESTMENT ACCOUNT

Place: ${c.local}. Date: ${c.data}

The purpose of this document is to authenticate and record the signature of the legal representative stated below, for the purpose of registering in the account opening process of a client account in the name of ${c.empresa} at CTB FINANCES.

It is to be noted that this authentication is exclusively valid for the purposes of opening a client account and will reaffirm any other documents related to the financial relationship between the Client and CTB FINANCES.

In witness whereof, and with equitable and declared intentions, the parties sign this Signature Card.`,
  assinaturas: (c) => [
    [`${c.ctbNome || '______________________'} - ${c.ctbCargo}`, `PIN - ${c.ctbPin}`, CTB.razao, `LICENSE No. ${CTB.licenca}`],
    [c.empresa, `Registered No. ${c.registro}`, `${c.cargoRep}: ${c.representante}`, `Passport: ${c.passaporte}`],
  ],
};

/** Mandato de intermediação: a CTB estrutura e apresenta o pedido a instituição LICENCIADA; não emite, não custodia,
 *  não recebe valores da instituição. Honorário de êxito só após a emissão efetiva pela instituição. (Proposta 18/11/2026,
 *  para revisão do advogado da titular.) */
const MANDATO = {
  titulo: 'Mandate and Service Agreement (Intermediation)',
  rotulo: 'MSA',
  campos: [
    { k: 'data', rotulo: 'Data (DD/MM/AAAA)', origem: 'hoje (Dubai)' },
    { k: 'local', rotulo: 'Local', padrao: 'Dubai - United Arab Emirates (UAE)' },
    { k: 'refSolicitacao', rotulo: 'Referência da solicitação', origem: 'solicitação de instrumento' },
    { k: 'empresa', rotulo: 'Cliente — empresa (ou nome)', origem: 'Meu perfil: empresa · senão nome do cliente' },
    { k: 'jurisdicao', rotulo: 'Constituída sob as leis de', padrao: 'the Federative Republic of Brazil', origem: 'Meu perfil: país da empresa' },
    { k: 'registro', rotulo: 'Nº de registro da empresa', origem: 'Meu perfil' },
    { k: 'endereco', rotulo: 'Endereço da empresa', origem: 'Meu perfil' },
    { k: 'representante', rotulo: 'Representante legal', origem: 'Meu perfil: nome' },
    { k: 'cargoRep', rotulo: 'Cargo do representante', padrao: 'CEO', origem: 'Meu perfil: cargo na empresa' },
    { k: 'passaporte', rotulo: 'Passaporte do representante', origem: 'Meu perfil (número completo)' },
    { k: 'instrumento', rotulo: 'Instrumento solicitado', origem: 'solicitação' },
    { k: 'valor', rotulo: 'Valor do instrumento', origem: 'solicitação' },
    { k: 'beneficiario', rotulo: 'Beneficiário do instrumento', origem: 'solicitação' },
    { k: 'honorarioEstruturacao', rotulo: 'Honorário de estruturação (ex.: USD 5,000.00)' },
    { k: 'honorarioExito', rotulo: 'Honorário de êxito (% do valor, ex.: 1.5%)' },
    { k: 'prazo', rotulo: 'Vigência do mandato (meses)', padrao: 'six (6)' },
    { k: 'ctbNome', rotulo: 'CTB — nome de quem assina', origem: 'Configuração de assinatura' },
    { k: 'ctbCargo', rotulo: 'CTB — cargo', padrao: 'EXECUTIVE DIRECTOR' },
    { k: 'ctbPin', rotulo: 'CTB — PIN', padrao: '120422' },
  ],
  texto: (c) => `# MANDATE AND SERVICE AGREEMENT
# FINANCIAL INSTRUMENT INTERMEDIATION

Place: ${c.local}.

Date: ${c.data}

Request reference: ${c.refSolicitacao}

${CTB.razao}, a company duly incorporated and registered under No. ${CTB.registro}, holding Commercial License No. ${CTB.licenca}, in accordance with the laws of the United Arab Emirates, with its principal office located at ${CTB.endereco} (hereinafter referred to as "CTB FINANCES" or the "INTERMEDIARY").

## AND

${c.empresa}, a company duly incorporated and existing under the laws of ${c.jurisdicao}, registered under No. ${c.registro}, with its principal place of business located at ${c.endereco}, represented herein by its ${c.cargoRep}, ${c.representante}, Passport No. ${c.passaporte} (hereinafter referred to as the "CLIENT").

## RECITALS

WHEREAS, the CLIENT wishes to obtain the issuance of a financial instrument by a duly licensed financial institution; and

WHEREAS, CTB FINANCES provides financial brokerage and consulting services and is willing to structure, present and follow up the CLIENT's request before duly licensed financial institutions, under the terms below.

NOW, THEREFORE, the Parties agree as follows:

## 1. Object

1.1 The CLIENT hereby appoints CTB FINANCES, on a non-exclusive basis, to structure, prepare and present the CLIENT's request for the issuance of a ${c.instrumento} in the amount of ${c.valor}, in favour of ${c.beneficiario} (the "Transaction"), to one or more duly licensed financial institutions (the "Issuing Institution"), and to follow up the process until its conclusion.

## 2. Nature of the Services

2.1 CTB FINANCES acts exclusively as intermediary and consultant. CTB FINANCES does not issue, guarantee, confirm or transmit financial instruments, does not hold the CLIENT's funds or assets in custody, and does not perform banking activities.

2.2 Any financial instrument shall be issued solely by the Issuing Institution, under its own credit approval, terms, conditions and communication channels. The Issuing Institution's decision is final and is not under the control of CTB FINANCES.

2.3 CTB FINANCES does not guarantee the approval, timing, amount or terms of the Transaction, which depend on the Issuing Institution's credit, compliance and KYC/AML assessment.

## 3. Services

CTB FINANCES shall:

• Analyse the CLIENT's documents and the commercial operation underlying the Transaction;
• Prepare the application package and the proposed wording of the instrument for the Issuing Institution's review;
• Select and present the Transaction to duly licensed financial institutions;
• Support the CLIENT in the negotiation of terms with the Issuing Institution;
• Follow up the process and report its progress to the CLIENT through the CTB FINANCES Client Area.

## 4. Obligations of the CLIENT

The CLIENT shall:

• Provide complete, accurate and up-to-date information and the KYC (Know Your Customer) documents requested by CTB FINANCES or by the Issuing Institution;
• Ensure that all funds, assets and collateral offered are of lawful origin and free of liens and encumbrances;
• Pay any charges, fees, collateral or deposits required by the Issuing Institution directly to the Issuing Institution;
• Inform CTB FINANCES immediately of any change in the information provided.

## 5. Fees

5.1 Structuring fee: ${c.honorarioEstruturacao}, payable upon signing of this Agreement, as consideration for the analysis and preparation work described in Clause 3.

5.2 Success fee: ${c.honorarioExito} of the face value of the instrument, payable only after the instrument has been effectively issued by the Issuing Institution and its issuance has been confirmed by the Issuing Institution.

5.3 No success fee shall be due if the instrument is not issued by an Issuing Institution during the term of this Agreement.

5.4 CTB FINANCES shall never receive, on behalf of the Issuing Institution, any amount relating to issuance charges, collateral or deposits, which shall be paid by the CLIENT directly to the Issuing Institution.

## 6. Term and Termination

6.1 This Agreement shall remain in force for ${c.prazo} months from its signing and may be extended by written agreement of the Parties.

6.2 Either Party may terminate this Agreement upon 15 (fifteen) days' written notice. Fees accrued up to the date of termination shall remain due.

## 7. Compliance

7.1 The Parties shall comply with the anti-money laundering and counter-terrorist financing legislation of the United Arab Emirates, including Federal Decree-Law No. 20 of 2018, and with applicable international sanctions.

7.2 CTB FINANCES may suspend or terminate this Agreement and report to the competent authorities any transaction that may indicate money laundering, terrorist financing, sanctions evasion or other related crimes.

## 8. Confidentiality and Personal Data

8.1 Each Party shall keep confidential all information received from the other Party in connection with this Agreement.

8.2 Personal data shall be processed in accordance with Federal Decree-Law No. 45 of 2021 on the Protection of Personal Data (PDPL).

## 9. Non-Circumvention

During the term of this Agreement and for a period of two (2) years thereafter, the CLIENT shall not, directly or indirectly, circumvent CTB FINANCES in relation to any Issuing Institution or business relationship introduced by CTB FINANCES under this Agreement.

## 10. Limitation of Liability

The liability of CTB FINANCES under this Agreement shall be limited to the amount of fees effectively received from the CLIENT. CTB FINANCES shall not be liable for decisions, delays or acts of the Issuing Institution or of any third party.

## 11. Governing Law and Jurisdiction

This Agreement shall be governed by the laws of the United Arab Emirates. Any dispute arising out of or in connection with this Agreement shall be subject to the exclusive jurisdiction of the courts of Dubai, United Arab Emirates. The English language shall govern the interpretation of this Agreement.

IN WITNESS WHEREOF, the Parties have executed this Agreement as of the date first written above.`,
  assinaturas: (c) => [
    [`${c.ctbNome || '______________________'} - ${c.ctbCargo}`, `PIN - ${c.ctbPin}`, CTB.razao, `LICENSE No. ${CTB.licenca}`],
    [c.empresa, `Registered No. ${c.registro}`, `${c.cargoRep}: ${c.representante}`, `Passport: ${c.passaporte}`],
  ],
};

export const MODELOS = { nda: NDA, abertura_conta: ABERTURA_CONTA, mandato: MANDATO };

/** Quais modelos o sistema cria SOZINHO (como rascunho, para a equipe revisar e liberar) em cada evento. */
export const AUTOMATICOS = {
  instrumento_aprovada: ['nda', 'abertura_conta'],
};
