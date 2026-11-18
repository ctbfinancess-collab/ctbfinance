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

export const MODELOS = { nda: NDA };

/** Quais modelos o sistema cria SOZINHO (como rascunho, para a equipe revisar e liberar) em cada evento. */
export const AUTOMATICOS = {
  instrumento_aprovada: ['nda'],
};
