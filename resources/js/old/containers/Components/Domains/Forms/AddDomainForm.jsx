// == Import : npm
import { connect } from 'react-redux';


// == Import : local
import AddDomainForm from '../../../../components/Components/Domains/Forms/AddDomainForm';
import {
    storeData,
    controlFormInput,
    controlFormErrors
} from '../../../../store/reducer';

/* === State (données) ===
* - mapStateToProps retroune un objet de props pour le composant de présentation
* - mapStateToProps met à dispo 2 params
*  - state : le state du store (getState)
*  - ownProps : les props passées au container
* Pas de data à transmettre ? const mapStateToProps = null;
*/
const mapStateToProps = (state, ownProps) => ({
    domains: state.domains ?? null,
    nsserver1: state.nsserver1 ?? null,
    nsserver2: state.nsserver2 ?? null,
    loading: state.loading ?? null,
    domain: state.domain ?? null,
    inputs: state.inputs ?? [],
    form_errors: state.form_errors ?? null,
});


/* === Actions ===
* - mapDispatchToProps retroune un objet de props pour le composant de présentation
* - mapDispatchToProps met à dispo 2 params
*  - dispatch : la fonction du store pour dispatcher une actio
*  - ownProps : les props passées au container
* Pas de disptach à transmettre ? const mapDispatchToProps = {};
*/
const mapDispatchToProps = (dispatch, ownProps) => ({
    storeData: (name, data) => (dispatch(storeData(name, data))),
    controlFormInput: (name, value) => (dispatch(controlFormInput(name, value))),
    controlFormErrors: (error) => (dispatch(controlFormErrors(error))),
});


// Container
const AddDomainFormContainer = connect(
mapStateToProps,
mapDispatchToProps,
)(AddDomainForm);


// == Export
export default AddDomainFormContainer;


/* = export à la volée
export default connect(
mapStateToProps,
mapDispatchToProps,
)(AddDomainForm);
*/