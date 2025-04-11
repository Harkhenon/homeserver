// == Import : npm
import { connect } from 'react-redux';


// == Import : local
import GeneralForm from '@src/Components/Hosting/Pages/Parts/GeneralForm';

import { controlFormInput } from '@js/store/reducer';


/* === State (données) ===
* - mapStateToProps retroune un objet de props pour le composant de présentation
* - mapStateToProps met à dispo 2 params
*  - state : le state du store (getState)
*  - ownProps : les props passées au container
* Pas de data à transmettre ? const mapStateToProps = null;
*/
const mapStateToProps = (state, ownProps) => ({
    currentDomain: state.currentDomain ?? null,
    domains: state.domains ?? null,
    inputs: state.inputs ?? null,
});


/* === Actions ===
* - mapDispatchToProps retroune un objet de props pour le composant de présentation
* - mapDispatchToProps met à dispo 2 params
*  - dispatch : la fonction du store pour dispatcher une actio
*  - ownProps : les props passées au container
* Pas de disptach à transmettre ? const mapDispatchToProps = {};
*/
const mapDispatchToProps = (dispatch, ownProps) => ({
    controlFormInput: (key, value) => (dispatch(controlFormInput(key, value))),
});


// Container
const GeneralFormContainer = connect(
mapStateToProps,
mapDispatchToProps,
)(GeneralForm);


// == Export
export default GeneralFormContainer;


/* = export à la volée
export default connect(
mapStateToProps,
mapDispatchToProps,
)(GeneralForm);
*/