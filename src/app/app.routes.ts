import {Routes} from '@angular/router';
import {
  LoginComponent,
  DashboardComponent,
  StudentsListComponent,
  NewStudentComponent,
  StudentProfileComponent,
  NewAssessmentComponent,
  AssessmentReportComponent,
  StudentGalleryComponent
} from './components';
import { LgpdSignComponent } from './lgpd-sign.component';
import { AgendaComponent } from './agenda.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: '', component: DashboardComponent },
  { path: 'agenda', component: AgendaComponent },
  { path: 'alunos', component: StudentsListComponent },
  { path: 'alunos/novo', component: NewStudentComponent },
  { path: 'alunos/:id/editar', component: NewStudentComponent },
  { path: 'alunos/:id', component: StudentProfileComponent },
  { path: 'alunos/:id/lgpd', component: LgpdSignComponent },
  { path: 'alunos/:id/avaliacoes/nova', component: NewAssessmentComponent },
  { path: 'alunos/:id/avaliacoes/:id_aval/editar', component: NewAssessmentComponent },
  { path: 'alunos/:id/avaliacoes/:id_aval', component: AssessmentReportComponent },
  { path: 'alunos/:id/galeria', component: StudentGalleryComponent },
  { path: '**', redirectTo: '' }
];

