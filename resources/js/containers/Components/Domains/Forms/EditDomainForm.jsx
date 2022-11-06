// == Import : npm
import { connect } from 'react-redux';


// == Import : local
import EditDomainForm from '../../../../components/Components/Domains/Forms/EditDomainForm';
import { storeData, controlFormInput, getDomains } from '../../../../store/reducer';

/* === State (données) ===
* - mapStateToProps retroune un objet de props pour le composant de présentation
* - mapStateToProps met à dispo 2 params
*  - state : le state du store (getState)
*  - ownProps : les props passées au container
* Pas de data à transmettre ? const mapStateToProps = null;
*/
const mapStateToProps = (state, ownProps) => ({
    domains: state.domains ?? null,
    inputs: state.inputs ?? null,
    loading: state.loading ?? null,
    activeTabItem: state.activeTabItem ?? null,
    zone: state.zone ?? [],
    zoneForm: state.zoneForm ?? [],
    actualDomain: state.actualDomain ?? null,
});


/* === Actions ===
* - mapDispatchToProps retroune un objet de props pour le composant de présentation
* - mapDispatchToProps met à dispo 2 params
*  - dispatch : la fonction du store pour dispatcher une actio
*  - ownProps : les props passées au container
* Pas de disptach à transmettre ? const mapDispatchToProps = {};
*/
const mapDispatchToProps = (dispatch, ownProps) => ({
    storeData: (name, value) => (dispatch(storeData(name, value))),
    controlFormInput: (name, value) => (dispatch(controlFormInput(name, value))),
    getDomains: () => (dispatch(getDomains())),
});


// Container
const EditDomainFormContainer = connect(
mapStateToProps,
mapDispatchToProps,
)(EditDomainForm);


// == Export
export default EditDomainFormContainer;


/* = export à la volée
export default connect(
mapStateToProps,
mapDispatchToProps,
)(EditDomainForm);
*/